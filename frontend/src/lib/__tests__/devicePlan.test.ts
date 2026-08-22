import { describe, expect, it } from "vitest";
import { planDeviceControl, protocolActions } from "@/lib/devicePlan";

describe("planDeviceControl", () => {
  it("queues flashlight on as a client device_action", () => {
    const plan = planDeviceControl("on", "flashlight");
    expect(plan.kind).toBe("phone");
    expect(plan.sideEffect?.type).toBe("device_action");
    expect(plan.sideEffect?.data.action).toMatch(/flashlight/);
    expect(plan.result).toMatch(/Queued/i);
  });

  it("queues vibrate with a duration value", () => {
    const plan = planDeviceControl("vibrate", "phone", "800");
    expect(plan.sideEffect?.data).toEqual(
      expect.objectContaining({ action: expect.stringMatching(/vibrate/), value: "800" }),
    );
  });

  it("queues smart-home actions on the JARVIS Home Hub instead of refusing", () => {
    const plan = planDeviceControl("on", "living room lights");
    expect(plan.kind).toBe("smarthome");
    expect(plan.sideEffect?.type).toBe("home_action");
    expect(plan.sideEffect?.data.device).toMatch(/living room lights/i);
    expect(plan.result).toMatch(/Home Hub/i);
  });

  it("treats torch as flashlight", () => {
    const plan = planDeviceControl("on", "torch");
    expect(plan.kind).toBe("phone");
    expect(plan.sideEffect?.data.action).toMatch(/flashlight/);
  });

  it("queues volume set", () => {
    const plan = planDeviceControl("set", "volume", "40");
    expect(plan.kind).toBe("phone");
    expect(plan.sideEffect?.data.value).toBe("40");
  });
});

describe("protocolActions", () => {
  it("SLEEP turns lights off, locks the door, and quiets the phone", () => {
    const acts = protocolActions("SLEEP");
    expect(acts.some((a) => /light/i.test(a.device) && a.action === "off")).toBe(true);
    expect(acts.some((a) => /door/i.test(a.device) && a.action === "lock")).toBe(true);
    expect(acts.some((a) => a.action === "dnd_on")).toBe(true);
  });

  it("SOS flashes, vibrates, and notifies", () => {
    const acts = protocolActions("SOS");
    expect(acts.some((a) => a.action.includes("flashlight"))).toBe(true);
    expect(acts.some((a) => a.action === "vibrate")).toBe(true);
    expect(acts.some((a) => a.action === "notify")).toBe(true);
  });
});
