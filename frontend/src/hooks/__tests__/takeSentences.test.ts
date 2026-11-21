import { describe, expect, it } from "vitest";
import { scriptLang, speechChunks, stripMarkdown, takeSentences } from "../useVoice";

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

describe("what is read aloud", () => {
  it("keeps a list number or an initial with the words that follow", () => {
    expect(takeSentences("1. Buy milk.\n2. Call J. K. Rao. Then").sentences).toEqual(["1. Buy milk.", "2. Call J. K. Rao."]);
  });

  it("says the words, not the markup, link addresses or table rules", () => {
    expect(stripMarkdown("## Plan\n**Step one:** open [the site](https://example.com/a?b=1) ~~now~~")).toBe("Plan Step one: open the site now");
    expect(stripMarkdown("| Item | Price |\n|---|---|\n| Tea | 20 |")).toBe("Item, Price. Tea, 20.");
    expect(stripMarkdown("See https://www.example.com/path/x for more")).toBe("See example.com for more");
  });

  it("speaks a long reply in short pieces and loses none of it", () => {
    const text = `${"This sentence is here to make the reply long, ".repeat(8)}and it ends. Second one.`;
    const chunks = speechChunks(text);
    expect(chunks.every((c) => c.length <= 220)).toBe(true);
    expect(chunks.join(" ")).toBe(text);
  });

  it("reads Hindi script with a Hindi voice", () => {
    expect(scriptLang("आज मौसम कैसा है")).toBe("hi-IN");
    expect(scriptLang("aaj mausam kaisa hai")).toBeUndefined();
    expect(scriptLang("مرحبا بالعالم", "ar-SA")).toBe("ar-SA");
  });

  it("never cuts a decimal number between two pieces", () => {
    const text = `${"Fill the tank slowly and keep watching the gauge, ".repeat(4)}then use the conversion factor of 3.5 and retain the result. Done.`;
    expect(speechChunks(text).some((c) => /3\.$/.test(c))).toBe(false);
    expect(speechChunks(text).join(" ")).toBe(text);
  });
});
