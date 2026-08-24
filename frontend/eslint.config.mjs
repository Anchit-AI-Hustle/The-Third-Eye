import nextConfig from "eslint-config-next/core-web-vitals";

// Next.js 16 removed the built-in `next lint` command in favor of running
// ESLint directly; eslint-config-next now ships ready-to-use flat config
// arrays (no FlatCompat bridge needed), so this just extends that array with
// the project's own rule overrides — the same ones .eslintrc.json carried.
const eslintConfig = [
  { ignores: ["node_modules/**", ".next/**", "out/**", "public/sw.js"] },
  ...nextConfig,
  {
    rules: {
      "react/jsx-no-comment-textnodes": "off",
      "react/no-unescaped-entities": "off",
      // eslint-plugin-react-hooks v6 (bundled with eslint-config-next@16) adds
      // a new "React Compiler readiness" rule set — set-state-in-effect,
      // static-components, refs, immutability, purity. These didn't exist in
      // the config this codebase was written against and fire ~80 times
      // across long-standing, deliberate, working patterns (wake word,
      // billing, team state). Adopting React Compiler readiness is a real,
      // separate effort deserving its own pass with actual testing per
      // change, not a side effect of a CVE patch. Off, not silently ignored —
      // this comment is the record of that decision.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      "react-hooks/purity": "off",
    },
  },
];

export default eslintConfig;
