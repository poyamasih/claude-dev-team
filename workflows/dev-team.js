export const meta = {
  name: 'dev-team',
  description: 'Unified dev team: manager divides the work, coder implements real code, security+hacker+tester+reviewer verify in parallel, manager gates, auto-loops until PASS. Token-tiered models + a persistent per-project memory.',
  whenToUse: 'Building or fixing a feature/bug end-to-end with research, design, review, red/blue security, and tests — driven by one task prompt. Pass args { task, context, maxIterations, deploy, models, effort, memory, alwaysRedTeam }.',
  phases: [
    { title: 'Research', detail: 'reads team memory + investigates the code & prior art to ground the plan' },
    { title: 'Plan', detail: 'manager divides the work + flags needsDesign / securitySensitive' },
    { title: 'Design', detail: 'designer produces a UI/UX spec (only when the plan flags UI work)' },
    { title: 'Build', detail: 'coder implements the change directly in the project' },
    { title: 'Review + Red/Blue + Test', detail: 'code-reviewer + security + tester (+ hacker if security-sensitive), in parallel' },
    { title: 'Gate', detail: 'manager verifies claims and rules PASS | REVISE (loops back on REVISE)' },
    { title: 'Memorize', detail: 'scribe records durable learnings to .dev-team/memory.md' },
    { title: 'Deploy', detail: 'deployer ships + smoke-tests — ONLY when args.deploy === true and the gate PASSed' },
  ],
}

// ---------------------------------------------------------------------------
// Drives installed sub-agents by NAME (agentType): researcher, manager,
// designer, coder, code-reviewer, security, hacker, tester, deployer — from
// ./agents/*.md in ~/.claude/agents/. Custom names load at Claude Code start,
// so restart your session once after installing.
//
// TOKEN STRATEGY (biggest lever = model tiering): hard reasoning runs on opus
// (coder, security, hacker, gate); mechanical/verification runs cheaper
// (sonnet/haiku) at lower effort. The deep red-team (hacker) runs only when the
// manager flags the change security-sensitive (or args.alwaysRedTeam=true).
// Override any of it via args.models / args.effort.
//
// MEMORY: the researcher reads .dev-team/memory.md first (so it doesn't
// re-discover known facts), and a cheap scribe appends durable learnings at the
// end. Disable with args.memory=false. Tip: add `.dev-team/` to .gitignore.
// ---------------------------------------------------------------------------

// args may arrive as an object OR a JSON-encoded string — accept both.
let A = args
if (typeof A === 'string') { try { A = JSON.parse(A) } catch (e) { A = {} } }
A = A || {}
if (!A.task) throw new Error('dev-team workflow needs args.task (and ideally args.context)')
const TASK = String(A.task)
const CONTEXT = String(A.context || '(no extra context provided)')
const MAX = Number(A.maxIterations || 2)
const DEPLOY = A.deploy === true          // deploy ONLY on explicit opt-in
const MEMORY = A.memory !== false         // team memory on by default
const MEM = String(A.memoryFile || '.dev-team/memory.md')
const ALWAYS_RED = A.alwaysRedTeam === true

// per-role model + effort (balanced defaults; override via args.models/args.effort)
const M = Object.assign({
  researcher: 'sonnet', plan: 'sonnet', designer: 'sonnet', coder: 'opus',
  review: 'sonnet', security: 'opus', hacker: 'opus', tester: 'haiku',
  gate: 'opus', deployer: 'sonnet', scribe: 'haiku',
}, A.models || {})
const E = Object.assign({
  researcher: 'medium', plan: 'medium', designer: 'low', coder: 'high',
  review: 'medium', security: 'high', hacker: 'high', tester: 'low',
  gate: 'high', deployer: 'low', scribe: 'low',
}, A.effort || {})

// ---------------- structured outputs (so the loop can branch) ----------------
const PLAN_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    needsDesign: { type: 'boolean', description: 'true only if this task changes something users see/touch. false for pure backend/API/infra.' },
    securitySensitive: { type: 'boolean', description: 'true if the change touches auth/tenants/money/public endpoints/URL-fetch/file handling/AI-tools/crypto/PII — anything an attacker could abuse. Err toward true when unsure.' },
    codeChangeSpec: { type: 'string', description: 'Concrete, grounded spec the coder can implement: what to add/change, which shared helper to create, which call sites to wire.' },
    filesToChange: { type: 'array', items: { type: 'string' } },
    tasks: { type: 'array', items: { type: 'object', additionalProperties: false,
      properties: { owner: { type: 'string' }, task: { type: 'string' }, acceptance: { type: 'string' } },
      required: ['owner', 'task', 'acceptance'] } },
  },
  required: ['summary', 'needsDesign', 'securitySensitive', 'codeChangeSpec', 'filesToChange', 'tasks'],
}
const GATE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'REVISE'] },
    hackerClean: { type: 'boolean', description: 'true if the hacker found ZERO breaches — OR the red-team was skipped as non-security-sensitive (nothing to breach).' },
    testerGreen: { type: 'boolean', description: 'true only if the build/vet/tests are green' },
    blockers: { type: 'array', items: { type: 'object', additionalProperties: false,
      properties: { owner: { type: 'string' }, location: { type: 'string' }, defect: { type: 'string' }, fix: { type: 'string' } },
      required: ['owner', 'defect', 'fix'] } },
    feedbackForCoder: { type: 'string' },
    memoryNote: { type: 'string', description: 'One or two durable one-line learnings a FUTURE run should know (convention, helper created, gotcha). Empty if none.' },
    summary: { type: 'string' },
  },
  required: ['verdict', 'hackerClean', 'testerGreen', 'blockers', 'feedbackForCoder', 'summary'],
}

// ---------------- prompts (persona comes from the agentType) ----------------
const FOCUS = `Review ONLY the files the coder changed (see their report / \`git diff\`) — do not re-explore the whole codebase.`

const researchPrompt =
  (MEMORY ? `Before investigating, READ the team memory file "${MEM}" if it exists — it holds durable learnings from past runs (conventions, reusable helpers, gotchas). Use it to AVOID re-discovering known facts, then investigate only what's still needed.\n\n` : '') +
  `Investigate this task so the Manager can plan from evidence, not guesses. Do BOTH: (1) map how the relevant code works today (real call sites, existing helpers to reuse, blast radius) with file:line, and (2) research the best-practice approach / prior art / known pitfalls & security advisories. Be concise and decision-useful. End with concrete options + a recommendation.\n\n` +
  `TASK:\n${TASK}\n\nCONTEXT:\n${CONTEXT}`

const planPrompt = (research) =>
  `You are the MANAGER — DIVIDE THE WORK. Using the researcher's findings (verify anything load-bearing against the real code), produce: (1) a concrete code-change spec the coder can implement, (2) the files to change, (3) needsDesign (true only if users see/touch what changes), (4) securitySensitive (true if the change touches auth/tenants/money/public endpoints/URL-fetch/files/AI-tools/crypto/PII — err toward true when unsure), (5) one task per acting member with a crisp acceptance criterion, (6) a one-line summary.\n\n` +
  `TASK:\n${TASK}\n\nCONTEXT:\n${CONTEXT}\n\n=== RESEARCHER'S FINDINGS ===\n${research}`

const designPrompt = (plan) =>
  `Produce a concrete UI/UX design spec for this task, grounded in the app's real design system/theme, that the coder can implement without guessing. If the task is non-visual, reply exactly "NO_UI — nothing to design for this task."\n\n` +
  `TASK:\n${TASK}\n\nCONTEXT:\n${CONTEXT}\n\n=== MANAGER'S PLAN ===\n${plan.summary}\n${plan.codeChangeSpec}`

const coderPrompt = (plan, design, feedback, iter) => [
  `Implement the assigned changes DIRECTLY in the project files. Real code — surgical, complete, correct. Build/vet before you report; do NOT deploy.`,
  ``,
  `TASK:\n${TASK}`,
  `CONTEXT:\n${CONTEXT}`,
  ``,
  `MANAGER'S CHANGE SPEC:\n${plan.codeChangeSpec}`,
  `FILES EXPECTED TO CHANGE: ${(plan.filesToChange || []).join(', ')}`,
  (design && !/^NO_UI/.test(design.trim())) ? `\n=== DESIGNER'S UI/UX SPEC (implement to this) ===\n${design}` : ``,
  feedback
    ? `\nPRIOR GATE = REVISE (now iteration ${iter}). Resolve EVERY blocker:\n${JSON.stringify(feedback.blockers, null, 1)}\nExtra feedback: ${feedback.feedbackForCoder}`
    : ``,
  ``,
  `Preserve any invariant the spec/context marks "do not change". Your final message MUST be a precise change report (files + line ranges + why, any new shared helper, how it meets each spec item, build result).`,
].filter(Boolean).join('\n')

const reviewPrompt = (coder) =>
  `Review the coder's change for NON-security code quality: correctness/logic bugs, non-security edge cases, performance, duplication vs existing helpers, error handling, dead code, readability, i18n/style. ${FOCUS} Don't re-report security issues or build failures (other members own those) unless they also cause a correctness bug.\n\n` +
  `TASK:\n${TASK}\n\n=== CODER'S CHANGE REPORT ===\n${coder}\n\n` +
  `Report: BLOCKERS (correctness/edge/perf/error-handling) with file:line + fix, then NITS, then CHECKED & OK. If clean, say so.`

const securityPrompt = (coder) =>
  `The coder just implemented a change (NOT yet deployed). Judge whether it correctly and completely meets the spec with no new weakness introduced. Static review only. ${FOCUS}\n\n` +
  `TASK:\n${TASK}\n\nCONTEXT:\n${CONTEXT}\n\n=== CODER'S CHANGE REPORT ===\n${coder}\n\n` +
  `Standard report format; specific file:line; if it's solid, say so and why.`

const hackerPrompt = (coder) =>
  `The coder's change is NOT yet deployed — do a STATIC red-team of the PATCHED SOURCE (and safe, non-destructive local checks): find a bypass that still defeats the new defense, a call site the coder forgot to wire, or a logic flaw. Do NOT run destructive actions or re-probe live production. ${FOCUS}\n\n` +
  `TASK:\n${TASK}\n\nCONTEXT:\n${CONTEXT}\n\n=== CODER'S CHANGE REPORT ===\n${coder}\n\n` +
  `Standard ROUND format: breaches worst-first with the exact vector, plus vectors the fix now blocks. Sign off ONLY if you genuinely cannot break it.`

const testerPrompt = (coder) =>
  `The coder changed code in this project. Verify it for real: run the project's build + vet/lint + relevant tests and report the ACTUAL output. Confirm the changed files compile and reason about the legitimate happy path. Note human-only checks (live/hardware) as manual steps.\n\n` +
  `=== CODER'S CHANGE REPORT ===\n${coder}\n\n` +
  `Standard report format with real command output. A build/vet/test failure is a FAIL — lead with it.`

const gatePrompt = (plan, coder, review, sec, hack, test) =>
  `You assigned this work; rule on it as the ship gate. Independently VERIFY load-bearing claims by re-reading the actual changed files and confirming the build. Return PASS ONLY IF: the tester's build is green, the code-reviewer has no unresolved BLOCKER, the coder covered the full spec, AND (the hacker found ZERO breaches — OR the red-team was skipped because the change is non-security-sensitive, in which case set hackerClean=true). Put one durable one-line learning in memoryNote if there is one.\n\n` +
  `TASK:\n${TASK}\n\nORIGINAL PLAN/SPEC:\n${JSON.stringify(plan, null, 1)}\n\n` +
  `=== CODER ===\n${coder}\n\n=== CODE-REVIEWER ===\n${review}\n\n=== SECURITY ===\n${sec}\n\n=== HACKER ===\n${hack}\n\n=== TESTER ===\n${test}\n\n` +
  `If REVISE, each blocker must be specific/actionable (owner, location, defect, fix) and feedbackForCoder must tell the coder exactly what to change next iteration.`

const scribePrompt = (plan, gate, coderReport) =>
  `You are the team's SCRIBE. Update the team memory file "${MEM}" with the DURABLE learnings from this run — facts a FUTURE run should know so it doesn't re-discover them. Read the file first (create it with a "# Dev-team memory" heading if absent; \`mkdir -p\` its folder). Append/merge CONCISE one-line bullets (architecture facts, conventions/helpers to reuse, gotchas, what this change did). Keep it SHORT and de-duplicated — never paste full reports, max ~6 bullets for this run. Do not record secrets.\n\n` +
  `TASK:\n${TASK}\nOUTCOME: ${gate ? gate.verdict : 'n/a'}\nMANAGER NOTE: ${gate && gate.memoryNote ? gate.memoryNote : '(none)'}\nPLAN: ${plan.summary}\nKEY CHANGES:\n${(coderReport || '').slice(0, 1200)}`

const deployPrompt = (plan, gate) =>
  `The change PASSed the gate and deployment IS explicitly authorized for this run. Deploy it, run post-deploy smoke tests, then report. If you cannot find the project's real deploy command, do NOT guess — report NOT AUTHORIZED/unknown and stop. Never print secrets. If smoke tests fail, roll back (or escalate with the manual recovery step).\n\n` +
  `AUTHORIZATION: explicit (args.deploy === true). GATE: PASS.\n\nTASK:\n${TASK}\n\nCONTEXT:\n${CONTEXT}\n\n=== WHAT SHIPPED ===\n${plan.summary}\n\n=== GATE SUMMARY ===\n${gate.summary}`

// ---------------- orchestration ----------------
phase('Research')
const research = await agent(researchPrompt, { agentType: 'researcher', model: M.researcher, effort: E.researcher, label: 'researcher' })
log('Research done — feeding the manager.')

phase('Plan')
const plan = await agent(planPrompt(research), { schema: PLAN_SCHEMA, agentType: 'manager', model: M.plan, effort: E.plan, label: 'manager:plan' })
const RED = ALWAYS_RED || plan.securitySensitive === true
log(`Plan ready: ${plan.summary}`)
log(`needsDesign=${plan.needsDesign} · securitySensitive=${plan.securitySensitive} · red-team=${RED ? 'ON' : 'skipped (non-sensitive)'}`)

let design = null
if (plan.needsDesign) {
  phase('Design')
  design = await agent(designPrompt(plan), { agentType: 'designer', model: M.designer, effort: E.designer, label: 'designer' })
  log('Design spec ready.')
} else {
  log('No UI in this task — skipping the design phase.')
}

let feedback = null, lastCoder = null, lastGate = null, passed = false, iters = 0
for (let i = 1; i <= MAX; i++) {
  iters = i
  phase(`Build (iter ${i})`)
  lastCoder = await agent(coderPrompt(plan, design, feedback, i), { agentType: 'coder', model: M.coder, effort: E.coder, label: `coder:iter${i}` })

  const rbPhase = `Review + Red/Blue + Test (iter ${i})`
  phase(rbPhase)
  const [review, sec, test, hack] = await parallel([
    () => agent(reviewPrompt(lastCoder),   { agentType: 'code-reviewer', model: M.review,   effort: E.review,   phase: rbPhase, label: `review:iter${i}` }),
    () => agent(securityPrompt(lastCoder), { agentType: 'security',      model: M.security, effort: E.security, phase: rbPhase, label: `security:iter${i}` }),
    () => agent(testerPrompt(lastCoder),   { agentType: 'tester',        model: M.tester,   effort: E.tester,   phase: rbPhase, label: `tester:iter${i}` }),
    () => RED
      ? agent(hackerPrompt(lastCoder), { agentType: 'hacker', model: M.hacker, effort: E.hacker, phase: rbPhase, label: `hacker:iter${i}` })
      : Promise.resolve('(red-team skipped — manager flagged this change non-security-sensitive)'),
  ])

  phase(`Gate (iter ${i})`)
  lastGate = await agent(gatePrompt(plan, lastCoder, review || '(no review)', sec || '(no security)', hack || '(no hacker)', test || '(no tester)'),
    { schema: GATE_SCHEMA, agentType: 'manager', model: M.gate, effort: E.gate, label: `manager:gate${i}` })
  log(`Gate iter ${i}: ${lastGate.verdict} | hackerClean=${lastGate.hackerClean} | testerGreen=${lastGate.testerGreen}`)

  if (lastGate.verdict === 'PASS' && lastGate.hackerClean && lastGate.testerGreen) { passed = true; break }
  feedback = lastGate
}

// Memory: record durable learnings so the next run starts smarter (and cheaper).
if (MEMORY) {
  phase('Memorize')
  try {
    await agent(scribePrompt(plan, lastGate, lastCoder), { agentType: 'general-purpose', model: M.scribe, effort: E.scribe, label: 'scribe' })
    log(`Learnings recorded to ${MEM}.`)
  } catch (e) { log(`(memory write skipped: ${e && e.message ? e.message : e})`) }
}

let deployResult = null
if (passed && DEPLOY) {
  phase('Deploy')
  log('Gate PASSed and deploy is explicitly authorized — deploying + smoke-testing.')
  deployResult = await agent(deployPrompt(plan, lastGate), { agentType: 'deployer', model: M.deployer, effort: E.deployer, label: 'deployer' })
} else if (passed) {
  log(`✅ Shippable after ${iters} iteration(s). Not deploying (human-gated; pass args.deploy=true). Review the git diff first.`)
} else {
  log(`⚠️ Did not fully pass within ${MAX} iterations — returning best state + open blockers.`)
}

return {
  status: passed ? 'PASS' : 'NOT_PASSED',
  iterations: iters,
  redTeam: RED,
  plan,
  designSpec: design,
  finalGate: lastGate,
  lastCoderReport: lastCoder,
  deploy: deployResult,
}
