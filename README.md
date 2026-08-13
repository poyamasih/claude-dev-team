# 🧑‍💻 Claude Dev Team

A drop-in **multi-agent software team** for [Claude Code](https://claude.com/claude-code). One prompt in — a shipped, verified change out. A **manager** divides the work, a **coder** writes the real code, and **researcher / security / hacker / tester** investigate, attack, and prove it — looping automatically until it passes.

> Built and battle-tested on a real production backend: in its first run it found a **live, unauthenticated critical SSRF** on a deployed API, then fixed it and proved the fix — end to end, with no human writing code. See [`docs/example-ssrf.md`](docs/example-ssrf.md).

---

## The team

| Member | Role | Writes code? |
|---|---|---|
| 🔍 **researcher** | Investigates the codebase + prior art / best practices / docs / advisories. Grounds every claim to a source. | ❌ |
| 📋 **manager** | Divides the work into a concrete spec, then **gates** the result — verifies claims against the real files, catches stubs/lies/laziness, and demands a report from everyone. | ❌ |
| 🟢 **coder** | The **only** member who writes code. Implements the spec directly in the project — minimal, complete, no stubs — and never deploys. | ✅ |
| 🔵 **security** | Blue team. Reviews the change for weaknesses and specifies the fix. | ❌ |
| 🔴 **hacker** | Red team. Actually tries to break what security cleared, with real PoCs. If it breaks in, security closes it and the hacker re-attacks — **loop until a clean round**. | ❌ |
| 🟢 **tester** | Runs the real build / vet / tests and reports the actual output — never a claimed pass. | ❌ |

**Pipeline:** `research → plan → build → (security ⇄ hacker) + test → gate → 🔁 fix-loop until PASS`

The manager will not PASS a change that touches auth / tenants / money / public endpoints / URL-fetch / AI-tools until the **hacker returns a zero-breach round** and the **build is green**.

---

## Install

```bash
git clone https://github.com/<you>/claude-dev-team.git
cd claude-dev-team
bash scripts/install.sh          # macOS / Linux / Git-Bash on Windows
#   …or on Windows PowerShell:
#   pwsh scripts/install.ps1
```

The installer copies:
- `agents/*.md`   → `~/.claude/agents/`   (the 6 team members)
- `workflows/dev-team.js` → `~/.claude/workflows/`  (the pipeline)
- `tools/*`       → `~/.claude/tools/`     (optional design/research helpers)

It **never** touches your API keys and never overwrites an existing key file.

> **Restart Claude Code once after installing** — custom agent names load at startup.

---

## Use

Inside Claude Code, just describe the work and ask the team to run:

```
Use the dev-team to add an "out of service" state to tables so orders can't be opened on them.
```

Claude runs the `dev-team` workflow: research → plan → code → security/hacker/test → gate, looping until it passes. It **edits real code and does not deploy** — you review the `git diff` and deploy yourself.

Run it directly as a workflow (advanced):

```js
Workflow({ scriptPath: "~/.claude/workflows/dev-team.js",
           args: { task: "…", context: "…", maxIterations: 2 } })
```

> Multi-agent workflows spawn several sub-agents and use real tokens — Claude Code will ask you to opt in before running one.

---

## 🔑 Optional design/research helpers (bring your own key)

Two optional "members" for visual design and ideation. **Keys are never stored in this repo** — the helpers read them from local, git-ignored files or environment variables.

| Helper | Key file (git-ignored) | Env var |
|---|---|---|
| `tools/gemini.py` — creative/design & critique | `~/.claude/gemini_design.key` | `GEMINI_DESIGN_API_KEY` |
| `tools/stitch/stitch.mjs` — whole-page UI generation | `~/.claude/stitch.key` | `STITCH_API_KEY` |

To enable one, drop your key into the file (or export the env var):

```bash
echo "YOUR_KEY_HERE" > ~/.claude/gemini_design.key   # gitignored, stays local
```

If no key is present, the team still runs fully — it just skips those optional helpers. The core team (researcher/coder/security/hacker/tester/manager) needs **no** API key beyond your normal Claude Code setup.

---

## Security & your keys

- `.gitignore` blocks `*.key`, `.env`, `*.local.json`, tokens, and PEM/PFX files.
- No secret is hardcoded anywhere in this repo — verify with `git grep -nE "AQ\.|sk_|AIza|-----BEGIN"` (should return nothing).
- The `security` and `hacker` members are read-only / non-destructive by design and will report a secret's **location** to rotate — never its value.

## License

MIT — see [`LICENSE`](LICENSE).
