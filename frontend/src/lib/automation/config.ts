// Automation configuration + post composition. Tune here.

export const AUTOMATION = {
  // Content generation model. Defaults to a current Claude model; override via
  // AUTOMATION_MODEL. Short social posts are cheap — Sonnet keeps quality high.
  model: process.env.AUTOMATION_MODEL || "claude-sonnet-5",

  hashtags: ["#personalfinance", "#investing", "#FinancialFreedom"],
  tipHashtags: ["#personalfinance", "#moneytips"],

  /** Assemble the final post string from the draft's parts. */
  compose(text: string, link?: string, hashtags?: string[]): string {
    const l = link ? `\n${link}` : "";
    const tags = hashtags && hashtags.length ? `\n\n${hashtags.join(" ")}` : "";
    return `${text}${l}${tags}`.trim();
  },
};
