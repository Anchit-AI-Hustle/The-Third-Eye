# Grassroot Molecular Agentic Framework

Operating system for building, auditing, and growing every app in the Anchit-AI-Hustle portfolio with single-purpose agents, molecular task decomposition, parallel execution, and a hard credit budget governor.

## Principles

1. **One agent, one purpose.** Every role is a separate agent definition in `.claude/agents/`. No agent ever does two jobs; overlap is a bug.
2. **Molecular decomposition.** Every goal is split by `feature-decomposer` into molecules — the smallest independently verifiable deliverable (≤1 file, 1 decision, or 1 asset), each owned by exactly one agent and verified by a different one.
3. **Parallel waves.** Molecules with no dependency between them run concurrently; dependent molecules run in later waves.
4. **Dedicated synthesis.** Executing agents never merge results. Six synthesizer agents (one per vertical + one master) do only that, and add nothing new.
5. **Budget governor.** No orchestrated run may spend more than **50% of the granted budget** — workflows check `budget.spent()` before every wave and halt with a log line. Weekly quota is protected by the rollout calendar: at most one repo family per day.

## The Org (55 agents, `.claude/agents/`)

| Vertical | Agents |
|---|---|
| **Strategy** (10) | founder-lens · ideation-generator · market-researcher · competitor-analyst · user-persona-builder · business-strategist · top-analyst · product-leader · tech-leader · growth-leader |
| **Finance & Ops** (6) | finance-planner · revenue-modeler · sales-strategist · tax-compliance · supply-chain-planner · partnership-manager |
| **Product** (3) | product-manager · feature-decomposer · roadmap-planner |
| **Design** (10) | ux-architect · ui-designer · visual-designer · animation-designer · effects-designer · design-system-curator · accessibility-auditor · content-specialist · copywriter · seo-specialist |
| **Engineering** (10) | frontend-developer · backend-developer · database-manager · api-designer · devops-engineer · network-engineer · hardware-planner · security-auditor · performance-optimizer · mobile-developer |
| **Quality** (5) | test-planner · unit-test-writer · e2e-test-writer · code-reviewer · qa-verifier |
| **Growth & Support** (5) | marketing-strategist · social-media-manager · press-communications · customer-support · customer-care |
| **Synthesis** (6) | strategy-synthesizer · design-synthesizer · engineering-synthesizer · gtm-synthesizer · quality-synthesizer · portfolio-synthesizer |

Model tiering for economy: mechanical/high-volume agents run on **haiku** (ideation, copy, social, support, motion/effects specs, roadmap, network, hardware, unit tests), everything judgment-heavy on **sonnet**. Nothing defaults to opus.

## Workflows (`.claude/workflows/`)

- **`molecular-build`** — `Workflow({name:'molecular-build', args:{goal:'...'}})`. Decompose → parallel waves → per-vertical synthesis → master brief. Hard cap 24 molecules per run; halts at 50% budget.
- **`portfolio-audit`** — `Workflow({name:'portfolio-audit', args:{targets:[{name,path}]}})`. Founder/UX/Tech lenses in parallel → security/a11y/tests deep pass (skipped if budget-halted) → ranked improvement plan per target.

## Molecular decomposition protocol

```
Venture → Vertical (strategy/finance/product/design/engineering/quality/growth)
        → Epic (one PRD section)
        → Molecule {id, vertical, agent, task, verify_by, deps}
```

A molecule is valid only if: one deliverable, one owner agent, a named verifying agent different from the owner, and a pass/fail check a machine or agent can run.

## Budget governor (credit protection)

- **Session rule:** every workflow computes `HALF = 50% of granted budget` and stops launching waves once `budget.spent() ≥ HALF`. Ungoverned runs are capped at 24 molecules.
- **Daily rule:** one repo (or repo family) audited/built per session, one session per day for framework work.
- **Weekly rule:** the rollout calendar below spreads the portfolio over weeks so framework work never claims more than half the weekly quota.
- **Concurrency:** ≤15 concurrent agents (session guideline), waves sized accordingly.
- **Verify passes:** single-vote verification by default; 3-vote adversarial only when a run is explicitly asked to be thorough.

## Portfolio rollout

The account has 42 repos ≈ 8 real products (see `PORTFOLIO_AUDIT.md`). Rollout: one family per day, consolidation first — auditing a repo that should be archived is wasted credit.

| Day | Family | Action |
|---|---|---|
| 1 | The-Third-Eye | Done — this audit (reference implementation) |
| 2 | Personal-AI-OS satellites (mirror-venture-os, mirror-private-intelligence-os, your-personal-ai-companion, TH-LifeEngine, TH--LifeEngine.app) | `portfolio-audit` → merge-or-archive verdicts |
| 3 | Music family (MusicGenAI + 9 predecessors) | Audit MusicGenAI only; archive the rest |
| 4 | HeyYaara family (3 repos) | Audit newest; archive the rest |
| 5 | Vahdam tooling (~12 repos) | Audit vahdam-lifecycle-os + vahdam_dtc_data_engine; consolidate mailer repos |
| 6 | Portfolio sites + The-Passion-Table + Kolab | `portfolio-audit` per repo |
| 7 | Buffer / deep passes deferred by the budget governor | — |

To run on another repo: open a Claude session there, copy `.claude/` from this repo (or add it as a git subtree), then invoke the workflows above.
