// Pure planner for control_device. Lives off the DOM so the chat route (Node)
// and the client executor can share one mapping.
//
// Two worlds:
//   1. THIS phone / browser — queued as device_action, executed with Web APIs
//      or the Capacitor DeviceControl plugin.
//   2. JARVIS Home Hub — queued as home_action, executed against the in-OS
//      smart-home inventory (lights, locks, thermostat…). A physical
//      Matter/HomeKit bridge is optional and not required for the hub to work.

export type DeviceActionPayload = {
  action: string;
  device: string;
  value: string | null;
};

export type DevicePlan = {
  kind: "phone" | "smarthome";
  result: string;
  sideEffect?: { type: "device_action" | "home_action"; data: DeviceActionPayload };
};

const SMART_HOME =
  /\b(light|lights|lamp|bulb|thermostat|lock|unlock|plug|outlet|speaker|tv|hub|matter|homekit|nest|hue|roomba|garage|blind|shutter|fan|ac|heater|door)\b/i;

const PHONE_DEVICES = new Set([
  "flashlight",
  "vibrate",
  "volume",
  "brightness",
  "dnd",
  "mute",
  "clipboard",
  "share",
  "camera",
  "location",
  "fullscreen",
  "wake_lock",
  "wifi",
  "bluetooth",
  "airplane",
  "notify",
  "status",
  "speak",
  "app",
  "alarm",
  "timer",
  "media",
  "ringer",
  "screen_lock",
  "go_home",
  "go_back",
  "recents",
  "screenshot",
  "notifications_shade",
  "quick_settings",
  "settings",
]);

// Said to the phone itself ("lock the phone"), these are phone actions, not Home Hub ones.
const PHONE_ACTIONS: Record<string, string> = {
  lock: "screen_lock", screenshot: "screenshot", home: "go_home", back: "go_back",
  play: "media", pause: "media", next: "media", previous: "media", skip: "media",
};

const ALIASES: Record<string, string> = {
  torch: "flashlight",
  flash: "flashlight",
  led: "flashlight",
  vibrator: "vibrate",
  haptic: "vibrate",
  haptics: "vibrate",
  rumble: "vibrate",
  sound: "volume",
  media: "volume",
  ring: "volume",
  screen: "brightness",
  display: "brightness",
  "do not disturb": "dnd",
  "do-not-disturb": "dnd",
  silent: "dnd",
  silence: "dnd",
  copy: "clipboard",
  cam: "camera",
  webcam: "camera",
  gps: "location",
  "full screen": "fullscreen",
  wakelock: "wake_lock",
  "wake lock": "wake_lock",
  "wi-fi": "wifi",
  bt: "bluetooth",
  "airplane mode": "airplane",
  notification: "notify",
  alert: "notify",
  battery: "status",
  phone: "phone",
  device: "phone",
  say: "speak",
  talk: "speak",
  "lock screen": "screen_lock",
  "screen lock": "screen_lock",
  "home screen": "go_home",
  home: "go_home",
  back: "go_back",
  "recent apps": "recents",
  "screen shot": "screenshot",
  music: "media",
  song: "media",
  player: "media",
  playback: "media",
  ringtone: "ringer",
  "ringer mode": "ringer",
  "alarm clock": "alarm",
  application: "app",
  "notification shade": "notifications_shade",
  "notification panel": "notifications_shade",
  "quick settings": "quick_settings",
  "control center": "quick_settings",
};

function canon(raw: string): string {
  const d = (raw || "").trim().toLowerCase();
  return ALIASES[d] ?? d.replace(/\s+/g, "_");
}

export function planDeviceControl(
  action: string,
  device: string,
  value?: string | number | null,
): DevicePlan {
  const targetRaw = (device || "phone").trim();
  const actRaw = (action || "status").trim();
  const payloadValue = value == null || value === "" ? null : String(value);

  const phoneAct = canon(targetRaw) === "phone" || !targetRaw.trim() ? PHONE_ACTIONS[actRaw.toLowerCase()] : undefined;
  const phoneTarget = PHONE_DEVICES.has(canon(targetRaw)) || Boolean(phoneAct);
  if (!phoneTarget && (SMART_HOME.test(targetRaw) || SMART_HOME.test(actRaw))) {
    return {
      kind: "smarthome",
      result:
        `Queued Home Hub ${actRaw} on “${targetRaw}”` +
        (payloadValue != null ? ` (${payloadValue})` : "") +
        `. The hub executor applies this on the operator’s device - report only what the executor confirms.`,
      sideEffect: {
        type: "home_action",
        data: { action: actRaw, device: targetRaw, value: payloadValue },
      },
    };
  }

  const target = phoneAct ?? (canon(targetRaw) || "phone");
  let act = phoneAct ? (target === "media" ? canon(actRaw) : target) : canon(actRaw) || "status";

  if (PHONE_DEVICES.has(target) && target !== "status") {
    if (["on", "enable", "start"].includes(act)) act = `${target}_on`;
    else if (["off", "disable", "stop"].includes(act)) act = `${target}_off`;
    else if (act === "toggle") act = `${target}_toggle`;
    else if (["set", "dim"].includes(act)) act = target;
  }

  const payload: DeviceActionPayload = {
    action: act,
    device: target,
    value: payloadValue,
  };

  return {
    kind: "phone",
    result:
      `Queued ${act} on the operator’s device` +
      (payload.value != null ? ` (${payload.value})` : "") +
      `. The device executor will apply it and the next message will reflect the real outcome - do not claim OS-level success beyond what the executor reports.`,
    sideEffect: { type: "device_action", data: payload },
  };
}

export function protocolActions(protocol: string): DeviceActionPayload[] {
  const p = (protocol || "").toUpperCase().trim();
  switch (p) {
    case "HOME":
      return [
        { action: "off", device: "all lights", value: null },
        { action: "lock", device: "front door", value: null },
        { action: "dnd_on", device: "phone", value: null },
        { action: "brightness", device: "phone", value: "40" },
      ];
    case "SLEEP":
      return [
        { action: "off", device: "all lights", value: null },
        { action: "off", device: "tv", value: null },
        { action: "lock", device: "front door", value: null },
        { action: "dnd_on", device: "phone", value: null },
        { action: "brightness", device: "phone", value: "8" },
        { action: "volume", device: "phone", value: "0" },
      ];
    case "WAKE":
      return [
        { action: "on", device: "all lights", value: "60" },
        { action: "dnd_off", device: "phone", value: null },
        { action: "brightness", device: "phone", value: "80" },
        { action: "volume", device: "phone", value: "40" },
      ];
    case "WORK":
      return [
        { action: "on", device: "office lights", value: "80" },
        { action: "dnd_on", device: "phone", value: null },
        { action: "brightness", device: "phone", value: "70" },
      ];
    case "TRAVEL":
      return [
        { action: "lock", device: "front door", value: null },
        { action: "off", device: "all lights", value: null },
        { action: "location", device: "phone", value: null },
      ];
    case "SOS":
      return [
        { action: "flashlight_on", device: "flashlight", value: null },
        { action: "vibrate", device: "phone", value: "1200" },
        { action: "notify", device: "phone", value: "JARVIS SOS - emergency protocol" },
        { action: "location", device: "phone", value: null },
      ];
    default:
      return [];
  }
}
