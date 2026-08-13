#!/usr/bin/env pwsh
# Install the Claude Dev Team into ~/.claude/ on Windows. Safe & idempotent.
# Never overwrites your API-key files.
$ErrorActionPreference = 'Stop'

$src  = Split-Path -Parent $PSScriptRoot
$dest = if ($env:CLAUDE_HOME) { $env:CLAUDE_HOME } else { Join-Path $HOME '.claude' }

Write-Host "Installing Claude Dev Team"
Write-Host "  from: $src"
Write-Host "  into: $dest"

foreach ($d in @('agents','workflows','skills/dev-team','tools/stitch')) {
  New-Item -ItemType Directory -Force -Path (Join-Path $dest $d) | Out-Null
}

Copy-Item (Join-Path $src 'agents/*.md') (Join-Path $dest 'agents') -Force
$n = (Get-ChildItem (Join-Path $src 'agents/*.md')).Count
Write-Host "  + agents  -> $dest/agents/ ($n members)"

Copy-Item (Join-Path $src 'workflows/dev-team.js') (Join-Path $dest 'workflows/dev-team.js') -Force
Write-Host "  + workflow -> $dest/workflows/dev-team.js"

Copy-Item (Join-Path $src 'SKILL.md') (Join-Path $dest 'skills/dev-team/SKILL.md') -Force
Write-Host "  + skill    -> $dest/skills/dev-team/SKILL.md"

Copy-Item (Join-Path $src 'tools/gemini.py') (Join-Path $dest 'tools/gemini.py') -Force -ErrorAction SilentlyContinue
Copy-Item (Join-Path $src 'tools/stitch/stitch.mjs') (Join-Path $dest 'tools/stitch/stitch.mjs') -Force -ErrorAction SilentlyContinue
Write-Host "  + tools    -> $dest/tools/ (optional helpers; keys stay local)"

Write-Host ""
Write-Host "Done. Next steps:"
Write-Host "  1) Restart Claude Code once so the agent names load."
Write-Host "  2) In a session:  `"Use the dev-team to <your task>.`""
Write-Host "  (Optional) enable design helpers by adding your own keys:"
Write-Host "     Set-Content `"$dest/gemini_design.key`" 'YOUR_GEMINI_KEY'   # gitignored, local only"
Write-Host "     Set-Content `"$dest/stitch.key`" 'YOUR_STITCH_KEY'          # gitignored, local only"
