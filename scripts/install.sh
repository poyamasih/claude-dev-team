#!/usr/bin/env bash
# Install the Claude Dev Team into ~/.claude/. Safe & idempotent.
# Never overwrites your API-key files.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${CLAUDE_HOME:-$HOME/.claude}"

echo "Installing Claude Dev Team"
echo "  from: $SRC"
echo "  into: $DEST"

mkdir -p "$DEST/agents" "$DEST/workflows" "$DEST/skills/dev-team" "$DEST/tools/stitch"

# 6 team members
cp "$SRC"/agents/*.md "$DEST/agents/"
echo "  ✓ agents  -> $DEST/agents/ ($(ls "$SRC"/agents/*.md | wc -l | tr -d ' ') members)"

# pipeline
cp "$SRC/workflows/dev-team.js" "$DEST/workflows/dev-team.js"
echo "  ✓ workflow -> $DEST/workflows/dev-team.js"

# skill entry (so /dev-team is discoverable)
cp "$SRC/SKILL.md" "$DEST/skills/dev-team/SKILL.md"
echo "  ✓ skill    -> $DEST/skills/dev-team/SKILL.md"

# optional design/research helpers (keyless; read keys from env or gitignored files)
cp "$SRC/tools/gemini.py" "$DEST/tools/gemini.py" 2>/dev/null || true
cp "$SRC/tools/stitch/stitch.mjs" "$DEST/tools/stitch/stitch.mjs" 2>/dev/null || true
echo "  ✓ tools    -> $DEST/tools/ (optional helpers; keys stay local)"

echo
echo "Done. Next steps:"
echo "  1) Restart Claude Code once so the agent names load."
echo "  2) In a session:  \"Use the dev-team to <your task>.\""
echo "  (Optional) enable design helpers by adding your own keys:"
echo "     echo YOUR_GEMINI_KEY > \"$DEST/gemini_design.key\"   # gitignored, local only"
echo "     echo YOUR_STITCH_KEY > \"$DEST/stitch.key\"          # gitignored, local only"
