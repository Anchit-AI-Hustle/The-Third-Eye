// JARVIS Home Hub — in-OS smart home until a Matter/HomeKit bridge is paired.
// Pure: no DOM, no localStorage. The chat route (Node) and the client executor
// share one matcher so "turn on the living room lights" always hits the same device.

export type HubKind =
  | "light"
  | "thermostat"
  | "lock"
  | "speaker"
  | "tv"
  | "plug"
  | "fan"
  | "blinds"
  | "ac";

export type HubDevice = {
  id: string;
  name: string;
  room: string;
  kind: HubKind;
  on: boolean;
  level: number;
  locked?: boolean;
};

export const DEFAULT_HUB: HubDevice[] = [
  { id: "lr-lights", name: "Living room lights", room: "Living room", kind: "light", on: false, level: 80 },
  { id: "br-lights", name: "Bedroom lights", room: "Bedroom", kind: "light", on: false, level: 45 },
  { id: "kt-lights", name: "Kitchen lights", room: "Kitchen", kind: "light", on: true, level: 90 },
  { id: "office-lights", name: "Office lights", room: "Office", kind: "light", on: false, level: 70 },
  { id: "thermo", name: "Thermostat", room: "Hall", kind: "thermostat", on: true, level: 22 },
  { id: "front-door", name: "Front door", room: "Entrance", kind: "lock", on: true, level: 100, locked: true },
  { id: "back-door", name: "Back door", room: "Kitchen", kind: "lock", on: true, level: 100, locked: true },
  { id: "tv", name: "Living room TV", room: "Living room", kind: "tv", on: false, level: 28 },
  { id: "speakers", name: "House speakers", room: "Living room", kind: "speaker", on: false, level: 40 },
  { id: "ac", name: "Air conditioner", room: "Bedroom", kind: "ac", on: false, level: 24 },
  { id: "blinds", name: "Living room blinds", room: "Living room", kind: "blinds", on: true, level: 100 },
  { id: "desk-plug", name: "Desk plug", room: "Office", kind: "plug", on: true, level: 100 },
];

export type HomeActionResult = {
  devices: HubDevice[];
  changed: HubDevice[];
  summary: string;
};

function norm(s: string): string {
  return (s || "").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function matchHubDevices(devices: HubDevice[], query: string): HubDevice[] {
  const q = norm(query);
  if (!q || q === "home" || q === "house" || q === "all" || q === "everything") {
    return devices;
  }
  if (/\ball lights\b|\blights\b|\blighting\b/.test(q) && !/\b(living|bedroom|kitchen|office|hall)\b/.test(q)) {
    return devices.filter((d) => d.kind === "light");
  }
  const rooms = [...new Set(devices.map((d) => d.room.toLowerCase()))];
  const roomHit = rooms.find((r) => q.includes(r.toLowerCase()) || r.toLowerCase().includes(q));
  const kindHit = (["light", "lights", "lamp", "thermostat", "lock", "door", "speaker", "tv", "television", "plug", "fan", "blinds", "ac", "air"] as const)
    .find((k) => q.includes(k));
  const kindMap: Record<string, HubKind> = {
    light: "light", lights: "light", lamp: "light",
    thermostat: "thermostat",
    lock: "lock", door: "lock",
    speaker: "speaker",
    tv: "tv", television: "tv",
    plug: "plug",
    fan: "fan",
    blinds: "blinds",
    ac: "ac", air: "ac",
  };

  let pool = devices;
  if (roomHit) pool = pool.filter((d) => d.room.toLowerCase() === roomHit);
  if (kindHit) pool = pool.filter((d) => d.kind === kindMap[kindHit]);

  const named = devices.filter((d) => {
    const n = norm(d.name);
    return n === q || n.includes(q) || q.includes(n) || q.includes(norm(d.id));
  });
  if (named.length) return named;
  if (pool.length && (roomHit || kindHit)) return pool;
  return [];
}

function applyOne(d: HubDevice, action: string, value?: string | null): HubDevice {
  const act = norm(action);
  const num = value != null && value !== "" ? Number(value) : NaN;
  const next = { ...d };

  if (d.kind === "lock" || act === "lock" || act === "unlock") {
    if (act === "unlock" || act === "open" || act === "off") {
      next.locked = false;
      next.on = false;
    } else if (act === "lock" || act === "on" || act === "close") {
      next.locked = true;
      next.on = true;
    } else if (act === "toggle") {
      next.locked = !d.locked;
      next.on = !!next.locked;
    }
    return next;
  }

  if (act === "on" || act === "enable" || act === "start" || act === "open") {
    next.on = true;
    if (d.kind === "blinds") next.level = 0;
  } else if (act === "off" || act === "disable" || act === "stop" || act === "close") {
    next.on = false;
    if (d.kind === "blinds") next.level = 100;
  } else if (act === "toggle") {
    next.on = !d.on;
  } else if (act === "dim" || act === "set" || act === "set temperature" || act === "set_temperature") {
    if (!Number.isNaN(num)) {
      next.level = d.kind === "thermostat" || d.kind === "ac"
        ? Math.max(16, Math.min(32, num))
        : Math.max(0, Math.min(100, num));
      next.on = next.level > 0;
    }
  }
  return next;
}

export function applyHomeAction(
  devices: HubDevice[],
  action: string,
  query: string,
  value?: string | null,
): HomeActionResult {
  const targets = matchHubDevices(devices, query);
  if (!targets.length) {
    const catalog = devices.map((d) => d.name).join(", ");
    return {
      devices,
      changed: [],
      summary: `No Home Hub device matches “${query}”. Available: ${catalog}.`,
    };
  }
  const ids = new Set(targets.map((t) => t.id));
  const changed: HubDevice[] = [];
  const next = devices.map((d) => {
    if (!ids.has(d.id)) return d;
    const upd = applyOne(d, action, value);
    if (upd !== d) changed.push(upd);
    return upd;
  });
  const bits = changed.map((d) => {
    if (d.kind === "lock") return `${d.name} ${d.locked ? "locked" : "unlocked"}`;
    if (d.kind === "thermostat" || d.kind === "ac") return `${d.name} ${d.on ? `${d.level}°C` : "off"}`;
    return `${d.name} ${d.on ? `on (${d.level}%)` : "off"}`;
  });
  return {
    devices: next,
    changed,
    summary: bits.length ? `Home Hub: ${bits.join("; ")}` : `Nothing changed on “${query}”.`,
  };
}
