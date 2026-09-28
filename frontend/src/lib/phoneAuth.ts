import { getAdminSupabase } from "@/lib/serverSupabase";
import { normPhone, phoneError, pinError } from "@/lib/phone";
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
  /** Unknown number: ask for a name and a new PIN — this is the sign-up. */
  | { ok: false; reason: "need_name"; error: null }
  /** Known number: ask for the PIN. */
  | { ok: false; reason: "need_pin"; name: string; error: null }
  /** Known number with no PIN yet (made before PINs, or just reset): choose one. */
  | { ok: false; reason: "set_pin"; name: string; error: string | null }
  | { ok: false; reason: "bad_pin"; error: string }
  | { ok: false; reason: "wrong_pin"; error: string; left: number }
  | { ok: false; reason: "locked"; error: string };

type Row = {
  id: string;
  phone: string;
  name: string;
  pin_hash: string | null;
  pin_salt: string | null;
  pin_tries: number | null;
  locked_until: string | null;
};

const COLUMNS = "id, phone, name, pin_hash, pin_salt, pin_tries, locked_until";

export async function enter(input: {
  phone?: unknown;
  cc?: unknown;
  name?: unknown;
  pin?: unknown;
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

  if (!row.pin_hash) {
    const perr = pinError(input.pin);
    if (perr) {
      return {
        ok: false,
        reason: "set_pin",
        name: row.name,
        error: input.pin == null || input.pin === "" ? null : perr,
      };
    }
    const h = hashPin(String(input.pin));
    await sb
      .from("phone_users")
      .update({
        pin_hash: h.hash,
        pin_salt: h.salt,
        pin_set_at: new Date().toISOString(),
        pin_tries: 0,
        locked_until: null,
      })
      .eq("id", row.id);
    await touch(sb, row.id);
    return { ok: true, user: pub(row), created: false };
  }

  if (row.locked_until && new Date(row.locked_until) > new Date()) {
    return { ok: false, reason: "locked", error: lockMessage(row.locked_until) };
  }

  if (input.pin == null || input.pin === "") {
    return { ok: false, reason: "need_pin", name: row.name, error: null };
  }

  if (!verifyPin(String(input.pin), row.pin_salt, row.pin_hash)) {
    const tries = (row.pin_tries ?? 0) + 1;
    if (tries >= MAX_TRIES) {
      const until = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString();
      await sb.from("phone_users").update({ pin_tries: 0, locked_until: until }).eq("id", row.id);
      return { ok: false, reason: "locked", error: lockMessage(until) };
    }
    await sb.from("phone_users").update({ pin_tries: tries }).eq("id", row.id);
    const left = MAX_TRIES - tries;
    return {
      ok: false,
      reason: "wrong_pin",
      left,
      error: `That PIN is not right. ${left} ${left === 1 ? "try" : "tries"} left.`,
    };
  }

  if (row.pin_tries) {
    await sb.from("phone_users").update({ pin_tries: 0, locked_until: null }).eq("id", row.id);
  }
  await touch(sb, row.id);
  return { ok: true, user: pub(row), created: false };
}

function pub(row: Row): PhoneUser {
  return { id: row.id, phone: row.phone, name: row.name };
}

async function touch(sb: NonNullable<ReturnType<typeof getAdminSupabase>>, id: string) {
  await sb.from("phone_users").update({ last_seen_at: new Date().toISOString() }).eq("id", id);
}
