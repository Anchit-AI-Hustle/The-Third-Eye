import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HealthEngine } from "@/components/health/HealthEngine";
import { featureHistory } from "@/lib/generations";

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const answer = (body: unknown) => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));

describe("Health Engine history", () => {
  it("keeps a generated plan in the feature's history", async () => {
    answer({ plan: "## Your plan\\nWalk daily.", provider: "groq" });
    render(<HealthEngine />);
    fireEvent.click(screen.getByRole("button", { name: /Generate my plan/ }));
    await waitFor(() => expect(featureHistory("health")).toHaveLength(1));
    expect(featureHistory("health")[0].output).toContain("Walk daily");
  });

  it("records nothing when no AI was available and no plan came back", async () => {
    // The route answers 200 with plan: null so the targets stay usable.
    answer({ plan: null, warning: "AI plan unavailable right now." });
    render(<HealthEngine />);
    fireEvent.click(screen.getByRole("button", { name: /Generate my plan/ }));
    await screen.findByText(/AI plan unavailable/);
    expect(featureHistory("health")).toHaveLength(0);
  });
});
