#!/usr/bin/env node
/**
 * Stitch helper — the team's "whole-page UI" member.
 * Generates a full UI screen from a prompt, returns HTML url + screenshot url,
 * and (optionally) downloads a self-contained copy locally.
 *
 * Key: ~/.claude/stitch.key (or env STITCH_API_KEY). Never hardcode/echo/commit it.
 * Quota is LIMITED — use only for whole-page UI; default model GEMINI_3_FLASH.
 *
 * Usage:
 *   node stitch.mjs "<prompt>" [--device MOBILE|DESKTOP|TABLET|AGNOSTIC]
 *        [--model GEMINI_3_FLASH|GEMINI_3_PRO|GEMINI_3_1_PRO] [--title T] [--download DIR]
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function loadKey() {
  if ((process.env.STITCH_API_KEY || "").trim()) return process.env.STITCH_API_KEY.trim();
  try { return readFileSync(join(homedir(), ".claude", "stitch.key"), "utf8").trim(); } catch { return ""; }
}

const argv = process.argv.slice(2);
let prompt = "", device = "MOBILE", model = "GEMINI_3_FLASH", title = "Team design", downloadDir = "";
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--device") device = argv[++i];
  else if (a === "--model") model = argv[++i];
  else if (a === "--title") title = argv[++i];
  else if (a === "--download") downloadDir = argv[++i];
  else if (!prompt) prompt = a;
}
if (!prompt) {
  console.error('usage: node stitch.mjs "<prompt>" [--device ..] [--model ..] [--title ..] [--download DIR]');
  process.exit(2);
}
const key = loadKey();
if (!key) { console.error("ERROR: no Stitch key (~/.claude/stitch.key or STITCH_API_KEY)"); process.exit(2); }
process.env.STITCH_API_KEY = key;

const { stitch } = await import("@google/stitch-sdk");
try {
  const project = await stitch.createProject(title);
  console.error(`[stitch] project=${project.id}`);
  const screen = await project.generate(prompt, device, model);
  console.error(`[stitch] screen=${screen.id}`);
  const [html, image] = await Promise.all([screen.getHtml(), screen.getImage()]);
  let downloaded = null;
  if (downloadDir) {
    downloaded = await project.downloadAssets(downloadDir);
    console.error(`[stitch] downloaded -> ${downloadDir}`);
  }
  console.log(JSON.stringify({ projectId: project.id, screenId: screen.id, htmlUrl: html, imageUrl: image, downloaded }, null, 2));
} catch (e) {
  console.error("STITCH ERROR:", (e && e.message) ? e.message : e);
  process.exit(1);
} finally {
  try { await stitch.close(); } catch { /* noop */ }
}
