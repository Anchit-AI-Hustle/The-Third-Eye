import { getDb, type Db } from "@/lib/db";
import { PIN_LEN, normPhone, phoneError, pinError } from "@/lib/phone";
import { MAX_TRIES, hashPin, lockMessage, verifyPin } from "@/lib/phonePin";

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

type Sb = Db;

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
 *
 * RETURNS NULL RATHER THAN A PLACEHOLDER when there is no address to be had. It
 * used to return "unknown", which is a perfectly good bucket key — so on a
 * deployment whose proxy sets neither header, every caller in the world shared one
 * window and the sixtieth request in ten minutes locked everybody out. A limit
 * keyed on nothing is not a limit on anyone; better to have no caller window and
 * leave the per-number one, which still applies.
 */
export function clientIp(
  headers: Headers | Record<string, string | undefined> | undefined,
): string | null {
  const get = (k: string) =>
    headers instanceof Headers ? headers.get(k) : (headers?.[k] ?? headers?.[k.toLowerCase()]);
  const real = String(get("x-real-ip") ?? "").trim();
  if (real) return real;
  const hops = String(get("x-forwarded-for") ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  return hops[hops.length - 1] ?? null;
}

export async function enter(input: {
  phone?: unknown;
  cc?: unknown;
  name?: unknown;
  pin?: unknown;
  /** For the rate limit only — never stored. Null when the platform gave no address. */
  ip?: string | null;
}): Promise<EnterResult> {
  const sb = getDb();
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
  // CALLER FIRST, THEN NUMBER — and the order is not cosmetic. Each check writes
  // a row keyed by what it counts, so checking the number first meant a caller
  // cycling through numbers had already inserted a bucket per request by the time
  // the caller limit refused them. Refusing the caller before touching the number
  // bucket keeps an abusive-but-honest client from growing that table at all.
  // (What actually bounds it is expiry — auth_rate_limit_hit prunes — because a
  // forged X-Forwarded-For passes this check every time however it is ordered.)
  //
  // The per-caller window is best-effort by nature, see clientIp, and looser at
  // sixty, because a shared or misread address must not shut a household — or a
  // whole CDN's worth of people — out of signing in.
  if (input.ip && !(await withinLimit(sb, "phone_ip", input.ip, 60, 600))) {
    return {
      ok: false,
      reason: "rate_limited",
      error: "Too many sign-in attempts from this device — please wait a few minutes.",
    };
  }
  // The per-NUMBER window is the real control: its key is the validated E.164
  // from the request body, so no header a caller can set will move it. Ten in ten
  // minutes sits above the five-try lockout, so a real person never meets it
  // first, and it bounds both the scrypt spent on one number and how often that
  // number can be locked.
  if (!(await withinLimit(sb, "phone_number", np.e164, 10, 600))) {
    return {
      ok: false,
      reason: "rate_limited",
      error: "Too many attempts for that number — please wait a few minutes.",
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

  if (input.pin == null || input.pin === "") {
    // No try is spent asking which question to put to the person.
    if (row.locked_until && new Date(row.locked_until) > new Date()) {
      return { ok: false, reason: "locked", error: lockMessage(row.locked_until) };
    }
    return { ok: false, reason: "need_pin", name: row.name, error: null };
  }

  // SPEND THE TRY BEFORE CHECKING THE PIN, not after. The row we read above is a
  // snapshot, and acting on its `locked_until` is what let a burst of concurrent
  // requests all see an unlocked account, all verify, and only then increment.
  // This takes the row lock, tests the lock and spends one try in a single
  // statement, so overlapping attempts queue behind each other and five means
  // five.
  const attempt = await beginAttempt(sb, row.id);
  if (!attempt.ok) return attempt.result;

  const pin = String(input.pin);
  // A PIN of the wrong shape cannot be right, so it never reaches scrypt — but it
  // has already cost a try, so this is not a way to probe for free.
  if (!PIN_SHAPE.test(pin) || !verifyPin(pin, row.pin_salt, row.pin_hash)) {
    // The last allowed attempt comes back already locked, dated from the guessing
    // rather than from whoever tries next. Saying how long beats "0 tries left".
    if (attempt.lockedUntil) {
      return { ok: false, reason: "locked", error: lockMessage(attempt.lockedUntil) };
    }
    const left = Math.max(0, MAX_TRIES - attempt.tries);
    return {
      ok: false,
      reason: "wrong_pin",
      left,
      error: `That PIN is not right. ${left} ${left === 1 ? "try" : "tries"} left.`,
    };
  }

  // The right PIN clears the count, the lock and the escalation ladder — without
  // the last of those, one bad afternoon would leave someone on 24-hour locks for
  // ever.
  //
  // AND THE RESULT IS CHECKED, because this attempt has already SPENT a try. If
  // the reset does not persist, a correct PIN still leaves the counter advanced —
  // so five good sign-ins in a row would lock the account, which is the opposite
  // of what a correct PIN should do. Retried once for a transient blip, then the
  // sign-in is refused rather than handing back a session that has quietly damaged
  // the account.
  const cleared = await clearFailures(sb, row.id);
  if (!cleared) {
    return {
      ok: false,
      reason: "locked",
      error: "Signed in, but we could not finish updating your account. Please try again.",
    };
  }
  return { ok: true, user: pub(row), created: false };
}

/**
 * Claim one attempt against this account, atomically, before any hashing.
 *
 * Returns `{ok: true, tries}` when the caller may go on to check the PIN, or the
 * refusal to hand straight back. The whole test-and-spend happens inside
 * phone_pin_attempt under a row lock, which is what makes five mean five even
 * when requests arrive together.
 */
async function beginAttempt(
  sb: Sb,
  id: string,
): Promise<
  { ok: true; tries: number; lockedUntil: string | null } | { ok: false; result: EnterResult }
> {
  const { data, error } = await sb.rpc("phone_pin_attempt", { p_id: id, p_max: MAX_TRIES });
  const state = (Array.isArray(data) ? data[0] : data) as
    | { allowed: boolean | null; tries: number | null; locked_until: string | null }
    | null
    | undefined;

  // The counter is the gate, so a counter that could not move must not read as a
  // free guess. A missing function or a wrong grant refuses the attempt.
  if (error || !state) {
    return {
      ok: false,
      result: {
        ok: false,
        reason: "locked",
        error: "Sign-in is temporarily unavailable. Please try again in a few minutes.",
      },
    };
  }

  if (!state.allowed) {
    return {
      ok: false,
      result: {
        ok: false,
        reason: "locked",
        error: state.locked_until
          ? lockMessage(state.locked_until)
          : "Sign-in is temporarily unavailable. Please try again in a few minutes.",
      },
    };
  }

  return { ok: true, tries: state.tries ?? MAX_TRIES, lockedUntil: state.locked_until ?? null };
}

/** Clear the failure count, lock and escalation ladder. One retry, then give up. */
async function clearFailures(sb: Sb, id: string): Promise<boolean> {
  for (let i = 0; i < 2; i++) {
    const { error } = await sb.rpc("phone_pin_ok", { p_id: id });
    if (!error) return true;
  }
  return false;
}

function pub(row: Row): PhoneUser {
  return { id: row.id, phone: row.phone, name: row.name };
}

async function touch(sb: Sb, id: string) {
  await sb.from("phone_users").update({ last_seen_at: new Date().toISOString() }).eq("id", id);
}
