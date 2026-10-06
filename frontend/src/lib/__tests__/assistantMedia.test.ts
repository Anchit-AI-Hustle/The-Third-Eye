import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const create = vi.fn();
const get = vi.fn();
vi.mock("@/lib/replicate", () => ({ replicateConfigured: () => true, createPrediction: (...args: unknown[]) => create(...args), getPrediction: (...args: unknown[]) => get(...args), videoUrlFrom: (output: unknown) => output, audioUrlFrom: () => null }));
import { assistantMediaStatus, startAssistantMedia } from "@/lib/assistantMedia";

beforeEach(() => { vi.stubEnv("TOKEN_ENCRYPTION_KEY", "unit-test-encryption"); create.mockReset(); get.mockReset(); });
afterEach(() => vi.unstubAllEnvs());

describe("assistant media delivery", () => {
  it("tracks a slow job without claiming completion, and lets only its owner poll it", async () => {
    create.mockResolvedValue({ id: "job123", status: "processing" });
    const output = await startAssistantMedia("a@example.com", "image", "Arsenal wallpaper");
    expect(output.result).toContain("job submitted (processing)");
    const link = /\]\(([^)]+)\)/.exec(output.result)![1];
    const ticket = new URL(link, "https://example.com").searchParams.get("ticket")!;
    await expect(assistantMediaStatus("b@example.com", ticket)).rejects.toThrow();
    expect(get).not.toHaveBeenCalled();
    get.mockResolvedValue({ status: "succeeded", output: "https://replicate.delivery/art.png", error: null });
    expect(await assistantMediaStatus("a@example.com", ticket)).toMatchObject({ status: "succeeded", url: "https://replicate.delivery/art.png" });
  });
  it("does not submit if it cannot securely deliver the job", async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "");
    const output = await startAssistantMedia("a@example.com", "video", "A sunset");
    expect(output.result).toContain("No job was started");
    expect(create).not.toHaveBeenCalled();
  });
  it("reports provider failure rather than inventing output", async () => {
    create.mockRejectedValue(new Error("quota exhausted"));
    expect((await startAssistantMedia("a@example.com", "image", "A sunset")).result).toContain("quota exhausted");
  });
});
