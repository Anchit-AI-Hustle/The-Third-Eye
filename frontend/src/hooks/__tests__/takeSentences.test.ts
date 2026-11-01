import { describe, expect, it } from "vitest";
import { takeSentences } from "../useVoice";

describe("takeSentences", () => {
  it("returns finished sentences and keeps the unfinished tail", () => {
    expect(takeSentences("Sure. I added milk to your list. Anything")).toEqual({
      sentences: ["Sure.", "I added milk to your list."],
      rest: "Anything",
    });
  });

  it("waits for whitespace after the stop, so decimals and a half-streamed sentence stay whole", () => {
    expect(takeSentences("It costs 3.5 lakh.")).toEqual({ sentences: [], rest: "It costs 3.5 lakh." });
  });

  it("splits on line breaks, as in lists", () => {
    expect(takeSentences("Today:\n- Gym at 7\n- Call mom\n")).toEqual({
      sentences: ["Today:", "- Gym at 7", "- Call mom"],
      rest: "",
    });
  });

  it("does not split after a common abbreviation", () => {
    expect(takeSentences("Meet Dr. Rao at noon. Then")).toEqual({ sentences: ["Meet Dr. Rao at noon."], rest: "Then" });
  });

  it("holds text inside an unfinished code block", () => {
    const { sentences } = takeSentences("Here it is.\n```js\nconst a = 1;\nconst b = 2;\n");
    expect(sentences).toEqual(["Here it is."]);
  });
});
