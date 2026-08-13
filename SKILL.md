---
name: dev-team
description: Run a full multi-agent software team (researcher, manager, coder, security, hacker, tester) to build or fix something end-to-end from one prompt. Use when the user asks to "use the dev team", wants a feature/bug handled with review + red/blue security + tests, or wants an audit-then-fix loop. The manager divides the work, the coder writes real code, security/hacker/tester verify, and it loops until it passes.
---

# Dev Team

A unified multi-agent team that takes a task from one prompt to a verified, shippable change.

## When to use
- The user says "use the dev-team / run the team", or asks for a feature or bug to be built and verified.
- Any change worth reviewing for correctness + security + tests before it ships.
- An adversarial security audit, optionally followed by an auto-fix loop.

Skip it for trivial one-line edits or pure Q&A — the fan-out isn't worth it.

## How it works
The team is the `dev-team` workflow at `~/.claude/workflows/dev-team.js`, driving six installed sub-agents (`~/.claude/agents/*.md`):

`research → plan (manager divides work) → build (coder writes real code) → security ⇄ hacker + tester (parallel) → gate (manager) → 🔁 loop on REVISE`

The manager verifies every claim against the real files, demands a report from each member, and will not PASS a security-relevant change until the hacker returns a **zero-breach** round and the build is green. **The coder is the only member that writes code. The team edits real code and never deploys** — the user reviews the `git diff` and deploys themselves.

## To run it
1. Gather the task and any useful context (files, findings, constraints).
2. Confirm the user wants the multi-agent run (it spawns several sub-agents and uses real tokens).
3. Invoke the workflow:

```js
Workflow({
  scriptPath: "~/.claude/workflows/dev-team.js",
  args: {
    task: "<what to build or fix, in one clear sentence>",
    context: "<relevant files, prior findings, invariants — e.g. 'do not rename X'>",
    maxIterations: 2
  }
})
```

4. When it finishes, **independently verify** before reporting success: read the changed files and run the build/tests yourself (don't rely solely on the gate's PASS). Then show the user the `git diff` and ask before deploying.

## Requirements
- The six agents must be installed in `~/.claude/agents/` (via `scripts/install.sh`) and Claude Code restarted once so the agent names load.
- No extra API key is required for the core team. The optional `gemini` / `stitch` design helpers read their keys from local git-ignored files (`~/.claude/*.key`) or env vars, and are skipped if absent.
