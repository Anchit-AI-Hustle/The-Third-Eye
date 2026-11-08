import { describe, expect, it } from "vitest";
import { cloudKey, localKey } from "@/lib/account/syncKeys";

describe("account sync keys", () => {
  it("follows the person's settings and app data, not the device's", () => {
    expect(cloudKey("jarvis_agent_profiles")).toBe("jarvis_agent_profiles");
    expect(cloudKey("te_agent_killed")).toBe("te_agent_killed");
    expect(cloudKey("jarvis_memory_v1_a@x.com")).toBe("jarvis_memory_v1_a@x.com");
    expect(cloudKey("te_device_id_v1")).toBeNull();
    expect(cloudKey("te_lifelog_always_listen")).toBeNull();
    expect(cloudKey("te_natural_voice")).toBeNull();
  });

  it("maps device-vault data to one account value and back onto each device", () => {
    expect(cloudKey("te_vault:dev_A:teamos:state")).toBe("vault:teamos:state");
    expect(localKey("vault:teamos:state", "dev_B")).toBe("te_vault:dev_B:teamos:state");
    expect(localKey("te_device_id_v1", "dev_B")).toBeNull();
  });
});
