import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/landing/HeroCanvas", () => ({ HeroCanvas: () => <div data-testid="webgl" /> }));

import { SceneBackdrop } from "@/components/hud/SceneBackdrop";

const ua = (value: string) => vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(value);

describe("SceneBackdrop", () => {
  afterEach(() => vi.restoreAllMocks());

  it("draws the 3D eye on a desktop browser", () => {
    ua("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130");
    const { queryByTestId } = render(<SceneBackdrop />);
    expect(queryByTestId("webgl")).not.toBeNull();
  });

  it("leaves WebGL out on an iPhone, where the sign-in screen kept crashing", () => {
    ua("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148");
    const { queryByTestId } = render(<SceneBackdrop />);
    expect(queryByTestId("webgl")).toBeNull();
  });
});
