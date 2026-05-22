# Jarvis OS — Claude Instructions

## Token Efficiency (MANDATORY)
- Responses: shortest possible. No preamble, no recap, no summary.
- Code: no comments unless the WHY is non-obvious. No docstrings.
- No "I'll now...", "Let me...", "Great!" or similar filler.
- Tool calls: batch all independent calls in one message.
- Skip explaining what you just did — the diff speaks.
- One sentence max per status update while working.

## Coding Standards
- No dead code, no unused imports, no backwards-compat shims.
- No defensive error handling for impossible cases.
- No abstractions beyond what the task requires.
- Prefer editing existing files over creating new ones.
- No markdown docs unless explicitly requested.
