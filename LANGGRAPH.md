# LangGraph fit — roadmap note (not yet implemented)

Source: portfolio-wide LangGraph scan, 29 Aug 2026 (chat-compiled goals across
27 public + several private repos). This file records that scan's assessment
for The-Third-Eye specifically. **It is a planning note only** — nothing in
this repo has been migrated to LangGraph, and this file does not change any
runtime behavior. See [DEVELOPMENT.md](DEVELOPMENT.md) and
[PROJECT_STATUS.md](PROJECT_STATUS.md) for what's actually shipped.

## Goal (from chat history)
OS-level assistant — read messages from any app, summarise, explain context,
auto-suggest replies; local-first encrypted vault; 31-tool JARVIS system,
48 active branches at scan time; pending fork: local-first vs hybrid vs
cloud; pending: Gemini vs Claude.

## Assessed fix via LangGraph
- The custom JARVIS tool loop (`app/api/chat/route.ts`'s function-calling
  loop) is a hand-built agent runtime. Replacing it with `create_agent` /
  `StateGraph` over the same tool set would let the orchestration code be
  deleted while keeping the tools (`lib/tools/schemas.ts` +
  `runTool` dispatch).
- **The local-first vs hybrid vs cloud architecture fork collapses into a
  config choice:** `SqliteSaver` on-device = local-first; `PostgresSaver` on
  Supabase = cloud; both = hybrid. A decision that's been open reduces to one
  checkpointer constructor argument.
- Gemini vs Claude dissolves the same way: LangGraph nodes are model-agnostic
  — cheap summarisation nodes could run Gemini, reply-drafting nodes Claude,
  benchmarked via LangSmith tracing instead of decided by feel.
- Auto-reply/any-send action would route through `interrupt()` before
  sending, always — matching this repo's own confirm-then-act pattern
  (`isSensitive`/`resolveIntent` in `route.ts`, `PermissionProvider`), which
  is already the same idea implemented by hand.

## Verdict (from the scan)
"Highest technical-debt payoff. 48 branches of custom runtime → one graph
definition." Rollout position #6 in the scan's proposed order — after the
greenfield/retrofit-cheap moves, positioned as debt payoff rather than a
new feature.

## Status
Not started. This note exists so the option is documented and discoverable;
it is not a commitment to migrate, and no code here currently depends on
LangGraph.
