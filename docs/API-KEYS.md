# 🔑 Providing API keys (optional design/research helpers)

**You do not need any API key to run the core team.** The six members
(researcher, manager, coder, security, hacker, tester) run on your normal
Claude Code setup. Keys are only for two **optional** design helpers:

| Helper | What it adds | Key file (local, git-ignored) | Env var alternative |
|---|---|---|---|
| `tools/gemini.py` | Creative/design ideation & screenshot critique (Google Gemini) | `~/.claude/gemini_design.key` | `GEMINI_DESIGN_API_KEY` |
| `tools/stitch/stitch.mjs` | Generate a whole page's UI at once (Google Stitch) | `~/.claude/stitch.key` | `STITCH_API_KEY` |

If a key is missing, the team still runs fully — it just skips that helper.

---

## Golden rule
> **Your key never goes into the repo, a prompt, a commit, or a chat message.**
> It lives in ONE local file (or an env var) that `.gitignore` already blocks.
> Anyone who has your key can spend your quota — treat it like a password.

---

## 1) Get a key

- **Gemini** → Google AI Studio: <https://aistudio.google.com/apikey> → *Create API key*.
  - The free tier works with `gemini-flash-latest` (the helper's default).
  - Pro models and image generation need **billing enabled** on the Google Cloud project, otherwise you'll get `HTTP 429 quota=0`.
- **Stitch** → your Google Stitch account. This key is **Stitch-scoped** — it will
  *not* work on the Gemini API, and a Gemini key will *not* work on Stitch.
  Quota is limited, so reserve Stitch for whole-page UI.

## 2) Give the key to the tool

Pick **one** of the two ways.

### Option A — key file (recommended, persists)
```bash
# macOS / Linux / Git-Bash
mkdir -p ~/.claude
printf '%s' 'PASTE_YOUR_KEY_HERE' > ~/.claude/gemini_design.key
printf '%s' 'PASTE_YOUR_KEY_HERE' > ~/.claude/stitch.key      # only if using Stitch
```
```powershell
# Windows PowerShell
New-Item -ItemType Directory -Force "$HOME\.claude" | Out-Null
Set-Content "$HOME\.claude\gemini_design.key" 'PASTE_YOUR_KEY_HERE' -NoNewline
Set-Content "$HOME\.claude\stitch.key"        'PASTE_YOUR_KEY_HERE' -NoNewline
```
The file lives in your home `~/.claude/`, **not** in this repo, so it can never be
committed. (Even if you copy it into the repo folder, `.gitignore` blocks `*.key`.)

### Option B — environment variable (good for CI / one-off shells)
```bash
export GEMINI_DESIGN_API_KEY='PASTE_YOUR_KEY_HERE'
export STITCH_API_KEY='PASTE_YOUR_KEY_HERE'
```
```powershell
$env:GEMINI_DESIGN_API_KEY = 'PASTE_YOUR_KEY_HERE'
$env:STITCH_API_KEY        = 'PASTE_YOUR_KEY_HERE'
```
The env var takes priority over the key file if both are set.

## 3) Verify it works
```bash
python ~/.claude/tools/gemini.py "say hi in 3 words"
node   ~/.claude/tools/stitch/stitch.mjs "a simple login screen" --device MOBILE
```
- A normal reply → you're set.
- `HTTP 401/403` → wrong or expired key (and check you used the *right* key for the
  *right* service — Gemini vs Stitch are different).
- `HTTP 429 quota=0` → the key is valid but that model needs billing; use
  `--model gemini-flash-latest` or enable billing.

---

## Rotating / removing a key
Just overwrite or delete the file (or unset the env var):
```bash
rm ~/.claude/gemini_design.key            # disables the Gemini helper
```
If a key ever leaks, revoke it at the provider console and create a new one —
rotation is instant and free.

## Why this design is safe
- Keys are read at **runtime** from a local file/env — never baked into code.
- `.gitignore` blocks `*.key`, `.env`, `*.local.json`, and token files.
- The `security` and `hacker` team members are built to report a secret's
  **location to rotate**, never its value.
