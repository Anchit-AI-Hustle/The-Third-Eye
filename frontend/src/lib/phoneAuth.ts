import { getAdminSupabase } from "@/lib/serverSupabase";
import { PIN_LEN, normPhone, phoneError, pinError } from "@/lib/phone";
import { LOCK_MINUTES, MAX_TRIES, hashPin, lockMessage, verifyPin } from "@/lib/phonePin";

// One door, both directions — the shape parwah-hq uses.
//
// `enter` is called twice per sign-in and the same function answers both times:
// once with just a number, to find out whether this person already exists and
// therefore whether to ask for a name or a PIN; then again with the PIN. A
// number that is not registered and arrives WITH a name is a sign-up, so
// signing up and signing in are one flow rather than two screens that ask for
// the same two things.

export type PhoneUser = { id: string; phone: string; name: string };

export type EnterResult =
  | { ok: true; user: PhoneUser; created: boolean }
  /** Supabase is not configured, so there is nowhere to keep a PIN hash. */
  | { ok: false; reason: "unconfigured"; error: string }
  | { ok: false; reason: "bad_phone"; error: string }
  /** Too many attempts from this caller. Nothing was read or written. */
  | { ok: false; reason: "rate_limited"; error: string }
  /** Unknown number: ask for a name and a new PIN — this is the sign-up. */
  | { ok: false; reason: "need_name"; error: null }
  /** Known number: ask for the PIN. */
  | { ok: false; reason: "need_pin"; name: string; error: null }
  | { ok: false; reason: "bad_pin"; error: string }
  | { ok: false; reason: "wrong_pin"; error: string; left: number }
  | { ok: false; reason: "locked"; error: string };

// pin_hash and pin_salt are NOT NULL in the schema, deliberately: see the note
// in 20260928120000_phone_pin_auth.sql. There is no "account without a PIN"
// state, so there is no branch here that hands one out to whoever asks.
type Row = {
  id: string;
  phone: string;
  name: string;
  pin_hash: string;
  pin_salt: string;
  pin_tries: number | null;
  locked_until: string | null;
};

type Sb = NonNullable<ReturnType<typeof getAdminSupabase>>;

const COLUMNS = "id, phone, name, pin_hash, pin_salt, pin_tries, locked_until";

// Only the shape, not the strength. An account may hold a PIN that today's
// pinError would refuse (the weak list can grow), and that person must still be
// able to sign in. What this buys is refusing a PIN that CANNOT be right before
// paying for scrypt, so an unauthenticated caller cannot spend the deployment's
// CPU on arbitrary strings.
const PIN_SHAPE = new RegExp(`^[0-9]{${PIN_LEN}}$`);

/**
 * Fixed-window rate limit, counted in the database so it holds across every
 * serverless instance.
 *
 * FAILS CLOSED. It used to fail open, on the reasoning that a limiter should not
 * be what stops people signing in — but on this path the limiter IS a security
 * control, and "the RPC errored" must not read as "no limit applies", or a
 * missing function or a bad grant quietly removes the cap while the lookups and
 * the scrypt hashing carry on. Nothing is lost by refusing: sign-in needs this
 * same database anyway, so if it cannot answer, the attempt could not have
 * succeeded.
 */
async function withinLimit(
  sb: Sb,
  bucket: string,
  key: string,
  limit: number,
  windowSecs: number,
): Promise<boolean> {
  const { data, error } = await sb.rpc("auth_rate_limit_hit", {
    p_bucket: bucket,
    p_key: key,
    p_window_secs: windowSecs,
  });
  if (error || typeof data !== "number") return false;
  return data <= limit;
}

/**
 * The caller's address, for a rate-limit key and nothing else — never stored.
 *
 * X-Forwarded-For is a LIST, and the entries a client sent itself come first;
 * only the ones the trusted proxy appended can be believed. Reading `[0]` meant
 * a caller could hand over a new address per request and get a fresh window
 * every time, which is no limit at all. So Vercel's own single-valued
 * `x-real-ip` is preferred, and X-Forwarded-For is read from the RIGHT, which is
 * the hop nearest our own edge.
 *
 * This is still a hint, not an identity: behind a further CDN the right-hand
 * entry can be that CDN rather than the visitor. That is why the per-number
 * window in `enter` — which no header can move — is the control this path relies
 * on, and this one is defence in depth.
 */
export function clientIp(headers: Headers | Record<string, string | undefined> | undefined): string {
  const get = (k: string) =>
    headers instanceof Headers ? headers.get(k) : (headers?.[k] ?? headers?.[k.toLowerCase()]);
  const real = String(get("x-real-ip") ?? "").trim();
  if (real) return real;
  const hops = String(get("x-forwarded-for") ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  return hops[hops.length - 1] ?? "unknown";
}

export async function enter(input: {
  phone?: unknown;
  cc?: unknown;
  name?: unknown;
  pin?: unknown;
  /** For the rate limit only — never stored. */
  ip?: string;
}): Promise<EnterResult> {
  const sb = getAdminSupabase();
  if (!sb) {
    return {
      ok: false,
      reason: "unconfigured",
      error: "Sign-in is not available: this deployment has no database configured.",
    };
  }

  const np = normPhone(input.phone, input.cc);
  if (!np) return { ok: false, reason: "bad_phone", error: phoneError(input.cc) };

  // TWO WINDOWS, BEFORE ANYTHING IS READ OR HASHED.
  //
  // The per-NUMBER one is the real control: its key comes from the validated
  // E.164 number in the request body, so no header a caller can set will move
  // it. Ten in ten minutes sits above the five-try account lockout, so it never
  // becomes the thing a real person hits first, and it bounds both the scrypt
  // spent on one number and how often that number can be locked.
  //
  // The per-caller one is defence in depth and is best-effort by nature — see
  // clientIp. It is looser, because a shared or misread address must not be able
  // to shut a household, or a whole CDN's worth of people, out of signing in.
  if (!(await withinLimit(sb, "phone_number", np.e164, 10, 600))) {
    return {
      ok: false,
      reason: "rate_limited",
      error: "Too many attempts for that number — please wait a few minutes.",
    };
  }
  if (input.ip && !(await withinLimit(sb, "phone_ip", input.ip, 60, 600))) {
    return {
      ok: false,
      reason: "rate_limited",
      error: "Too many sign-in attempts from this device — please wait a few minutes.",
    };
  }

  const { data } = await sb.from("phone_users").select(COLUMNS).eq("phone", np.e164).maybeSingle();
  let row = data as Row | null;

  if (!row) {
    const name = String(input.name ?? "").trim().slice(0, 60);
    if (!name) return { ok: false, reason: "need_name", error: null };
    // A new person chooses their PIN in the same breath as their name. Making
    // it a later, skippable step is how an account ends up without one.
    const perr = pinError(input.pin);
    if (perr) return { ok: false, reason: "bad_pin", error: perr };
    const h = hashPin(String(input.pin));
    const { data: made, error } = await sb
      .from("phone_users")
      .insert({
        phone: np.e164,
        phone_cc: np.cc,
        phone_local: np.local,
        name,
        pin_hash: h.hash,
        pin_salt: h.salt,
        pin_set_at: new Date().toISOString(),
      })
      .select(COLUMNS)
      .maybeSingle();
    if (made) {
      await touch(sb, (made as Row).id);
      return { ok: true, user: pub(made as Row), created: true };
    }
    // Raced with another sign-up for the same number: fall through to sign-in.
    const { data: again } = await sb
      .from("phone_users")
      .select(COLUMNS)
      .eq("phone", np.e164)
      .maybeSingle();
    if (!again) {
      return {
        ok: false,
        reason: "unconfigured",
        error: error?.message ?? "Could not create that account. Please try again.",
      };
    }
    row = again as Row;
  }

  if (row.locked_until && new Date(row.locked_until) > new Date()) {
    return { ok: false, reason: "locked", error: lockMessage(row.locked_until) };
  }

  if (input.pin == null || input.pin === "") {
    return { ok: false, reason: "need_pin", name: row.name, error: null };
  }

  const pin = String(input.pin);
  // A PIN of the wrong shape cannot be right, so it is counted as a failure but
  // never hashed. Counting it costs an attacker the same as a well-formed guess
  // and costs this server nothing.
  if (!PIN_SHAPE.test(pin) || !verifyPin(pin, row.pin_salt, row.pin_hash)) {
    return await countFailure(sb, row.id);
  }

  if (row.pin_tries) {
    await sb.from("phone_users").update({ pin_tries: 0, locked_until: null }).eq("id", row.id);
  }
  await touch(sb, row.id);
  return { ok: true, user: pub(row), created: false };
}

/**
 * Count a wrong PIN, and lock the account if that was the last try.
 *
 * ONE STATEMENT, IN THE DATABASE. Read-then-write in application code let
 * parallel guesses all read the same counter and write the same value back, so
 * N simultaneous attempts advanced it by one and the lock never arrived — which
 * is the difference between five guesses per fifteen minutes and as many as the
 * attacker can open at once, against a secret that is one of ten thousand.
 */
async function countFailure(sb: Sb, id: string): Promise<EnterResult> {
  const { data, error } = await sb.rpc("phone_pin_fail", {
    p_id: id,
    p_max: MAX_TRIES,
    p_lock_minutes: LOCK_MINUTES,
  });
  const state = (Array.isArray(data) ? data[0] : data) as
    | { tries: number | null; locked_until: string | null }
    | null
    | undefined;

  // The counter is the gate, so a counter that did not move must not read as a
  // free guess. If the function is missing or errored, refuse the attempt and
  // say so rather than inviting another one.
  if (error || !state) {
    return {
      ok: false,
      reason: "locked",
      error: "Sign-in is temporarily unavailable. Please try again in a few minutes.",
    };
  }

  if (state.locked_until && new Date(state.locked_until) > new Date()) {
    return { ok: false, reason: "locked", error: lockMessage(state.locked_until) };
  }

  const left = Math.max(0, MAX_TRIES - (state.tries ?? 0));
  return {
    ok: false,
    reason: "wrong_pin",
    left,
    error: `That PIN is not right. ${left} ${left === 1 ? "try" : "tries"} left.`,
  };
}

function pub(row: Row): PhoneUser {
  return { id: row.id, phone: row.phone, name: row.name };
}

async function touch(sb: Sb, id: string) {
  await sb.from("phone_users").update({ last_seen_at: new Date().toISOString() }).eq("id", id);
}
