export const meta = {
  name: 'dev-team',
  description: 'Unified dev team: manager divides the work, coder implements real code, security+hacker+tester verify in parallel, manager gates, auto-loops until PASS + zero-breach + green build.',
  whenToUse: 'Building or fixing a feature/bug end-to-end with research, review, red/blue security, and tests — driven by one task prompt. Pass args { task, context, maxIterations }.',
  phases: [
    { title: 'Research', detail: 'researcher investigates the code + prior art/best practices to ground the plan' },
    { title: 'Plan', detail: 'manager divides the work + decides whether design is needed' },
    { title: 'Design', detail: 'designer produces a UI/UX spec (only when the plan flags UI work)' },
    { title: 'Build', detail: 'coder implements the change directly in the project' },
    { title: 'Review + Red/Blue + Test', detail: 'code-reviewer + security + hacker + tester, in parallel' },
    { title: 'Gate', detail: 'manager verifies claims and rules PASS | REVISE (loops back on REVISE)' },
    { title: 'Deploy', detail: 'deployer ships + smoke-tests — ONLY when args.deploy === true and the gate PASSed' },
  ],
}

// ---------------------------------------------------------------------------
// This workflow drives installed sub-agents by NAME (agentType): researcher,
// manager, designer, coder, code-reviewer, security, hacker, tester, deployer —
// from ./agents/*.md installed into ~/.claude/agents/. Custom agent names load
// at Claude Code start, so if you JUST installed them, restart your session once
// before running this. The design phase runs only when the manager flags UI work;
// the deploy phase runs only when args.deploy === true AND the gate PASSed.
// The workflow edits real code and does NOT deploy by default (review the diff).
// ---------------------------------------------------------------------------

// args may arrive as an object OR a JSON-encoded string depending on the caller — accept both.
let A = args
if (typeof A === 'string') { try { A = JSON.parse(A) } catch (e) { A = {} } }
A = A || {}
if (!A.task) throw new Error('dev-team workflow needs args.task (and ideally args.context)')
const TASK = String(A.task)
const CONTEXT = String(A.context || '(no extra context provided)')
const MAX = Number(A.maxIterations || 2)
const DEPLOY = A.deploy === true // deploy ONLY on explicit opt-in; stays human-gated by default

// ---------------- structured outputs (so the loop can branch) ----------------
const PLAN_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    needsDesign: { type: 'boolean', description: 'true only if this task changes something users see/touch (a UI/UX design spec would help before coding). false for pure backend/API/infra.' },
    codeChangeSpec: { type: 'string', description: 'Concrete, grounded spec the coder can implement: what to add/change, which shared helper to create, which call sites to wire.' },
    filesToChange: { type: 'array', items: { type: 'string' } },
    tasks: { type: 'array', items: { type: 'object', additionalProperties: false,
      properties: { owner: { type: 'string' }, task: { type: 'string' }, acceptance: { type: 'string' } },
      required: ['owner', 'task', 'acceptance'] } },
  },
  required: ['summary', 'needsDesign', 'codeChangeSpec', 'filesToChange', 'tasks'],
}
const GATE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'REVISE'] },
    hackerClean: { type: 'boolean', description: 'true only if the hacker found ZERO bypasses/breaches' },
    testerGreen: { type: 'boolean', description: 'true only if the build/vet/tests are green' },
    blockers: { type: 'array', items: { type: 'object', additionalProperties: false,
      properties: { owner: { type: 'string' }, location: { type: 'string' }, defect: { type: 'string' }, fix: { type: 'string' } },
      required: ['owner', 'defect', 'fix'] } },
    feedbackForCoder: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['verdict', 'hackerClean', 'testerGreen', 'blockers', 'feedbackForCoder', 'summary'],
}

// ---------------- prompts (persona comes from the agentType, not the prompt) ----------------
const researchPrompt =
  `Investigate this task so the Manager can plan from evidence, not guesses. Do BOTH: (1) map how the relevant code works today (real call sites, existing helpers/conventions to reuse, blast radius) with file:line, and (2) research the best-practice approach / prior art / official docs / known pitfalls & security advisories for solving it. End with concrete options + a clear recommendation.\n\n` +
  `TASK:\n${TASK}\n\nCONTEXT:\n${CONTEXT}`

const planPrompt = (research) =>
  `You are the MANAGER and your first job is to DIVIDE THE WORK for the team. ` +
  `Use the researcher's findings below (verify anything load-bearing against the real code), then produce: (1) a concrete code-change spec the coder can implement (what to add/change, which single shared helper to create, which call sites to wire), (2) the list of files to change, (3) whether this task needs a UI/UX design pass (needsDesign = true only if users see/touch what changes), (4) one task per member that will act (designer if needsDesign / coder / code-reviewer / security / hacker / tester) each with a crisp acceptance criterion, (5) a one-line summary.\n\n` +
  `TASK:\n${TASK}\n\nCONTEXT:\n${CONTEXT}\n\n=== RESEARCHER'S FINDINGS ===\n${research}`

const designPrompt = (plan) =>
  `Produce a concrete UI/UX design spec for this task, grounded in the app's real design system/theme, that the coder can implement without guessing. If the task turns out to be non-visual, reply exactly "NO_UI — nothing to design for this task."\n\n` +
  `TASK:\n${TASK}\n\nCONTEXT:\n${CONTEXT}\n\n=== MANAGER'S PLAN ===\n${plan.summary}\n${plan.codeChangeSpec}`

const coderPrompt = (plan, design, feedback, iter) => [
  `Implement the assigned changes DIRECTLY in the project files. This is real code — be surgical, complete, and correct. Build/vet before you report; do NOT deploy.`,
  ``,
  `TASK:\n${TASK}`,
  `CONTEXT:\n${CONTEXT}`,
  ``,
  `MANAGER'S CHANGE SPEC:\n${plan.codeChangeSpec}`,
  `FILES EXPECTED TO CHANGE: ${(plan.filesToChange || []).join(', ')}`,
  (design && !/^NO_UI/.test(design.trim())) ? `\n=== DESIGNER'S UI/UX SPEC (implement to this) ===\n${design}` : ``,
  feedback
    ? `\nPRIOR GATE = REVISE (now iteration ${iter}). You MUST resolve every blocker:\n${JSON.stringify(feedback.blockers, null, 1)}\nExtra feedback: ${feedback.feedbackForCoder}`
    : ``,
  ``,
  `Preserve any invariant the spec/context marks as "do not change". Your final message MUST be your precise change report (files + line ranges + why, any new shared helper, how it meets each spec item, build result).`,
].filter(Boolean).join('\n')

const reviewPrompt = (coder) =>
  `Review the coder's change for NON-security code quality: correctness/logic bugs, non-security edge cases, performance, duplication vs existing helpers, error handling, dead code, readability, and i18n/style consistency. Read the ACTUAL changed files. Do not re-report security issues or build failures (other members own those) unless they also cause a correctness bug.\n\n` +
  `TASK:\n${TASK}\n\n=== CODER'S CHANGE REPORT ===\n${coder}\n\n` +
  `Follow your standard report format: BLOCKERS (correctness/edge/perf/error-handling) with file:line + fix, then NITS, then CHECKED & OK. If clean, say so.`

const securityPrompt = (coder) =>
  `The coder just implemented a fix/feature (NOT yet deployed). Read the ACTUAL changed files and judge whether it correctly and completely closes the issue / meets the spec with no new weakness introduced. Static review only.\n\n` +
  `TASK:\n${TASK}\n\nCONTEXT:\n${CONTEXT}\n\n=== CODER'S CHANGE REPORT ===\n${coder}\n\n` +
  `Follow your standard report format; be specific with file:line; if it's now solid, say so and exactly why.`

const hackerPrompt = (coder) =>
  `The coder's change is NOT yet deployed, so do a STATIC red-team of the PATCHED SOURCE (and, where safe and non-destructive, local/offline checks): try to find a bypass that still defeats the new defense, or a call site the coder forgot to wire, or a logic flaw. Do NOT run destructive actions or re-probe live production for the new code — it isn't live. Read the real changed files.\n\n` +
  `TASK:\n${TASK}\n\nCONTEXT:\n${CONTEXT}\n\n=== CODER'S CHANGE REPORT ===\n${coder}\n\n` +
  `Report in your standard ROUND format: breaches worst-first with the exact vector, plus the vectors the fix now blocks. Sign off ONLY if you genuinely cannot break it.`

const testerPrompt = (coder) =>
  `The coder changed code in this project. Verify it for real: run the project's build + vet/lint + any relevant tests and report the ACTUAL output. Confirm the changed files compile and reason about whether the legitimate happy path still works. Note anything only a human can test (live/hardware) as a manual step.\n\n` +
  `=== CODER'S CHANGE REPORT ===\n${coder}\n\n` +
  `Follow your standard report format with real command output. A build/vet/test failure is a FAIL — lead with it.`

const gatePrompt = (plan, coder, review, sec, hack, test) =>
  `You assigned this work; now rule on it as the ship gate. You have reports from every member below. Independently VERIFY the load-bearing claims by re-reading the actual changed files and confirming the build. Enforce the security↔hacker loop: return PASS ONLY IF the hacker found ZERO breaches AND the tester's build is green AND the code-reviewer has no unresolved BLOCKER AND the coder covered the full spec.\n\n` +
  `TASK:\n${TASK}\n\nORIGINAL PLAN/SPEC:\n${JSON.stringify(plan, null, 1)}\n\n` +
  `=== CODER REPORT ===\n${coder}\n\n=== CODE-REVIEWER REPORT ===\n${review}\n\n=== SECURITY REPORT ===\n${sec}\n\n=== HACKER REPORT ===\n${hack}\n\n=== TESTER REPORT ===\n${test}\n\n` +
  `Return the structured verdict. If REVISE, each blocker must be specific/actionable (owner, location, defect, fix) and feedbackForCoder must tell the coder exactly what to change next iteration.`

const deployPrompt = (plan, gate) =>
  `The change PASSed the gate and deployment IS explicitly authorized for this run. Deploy it, then run post-deploy smoke tests, then report. If you cannot find the project's real deploy command, do NOT guess — report NOT AUTHORIZED/unknown and stop. Never print secrets. If smoke tests fail, roll back (or escalate with the manual recovery step).\n\n` +
  `AUTHORIZATION: explicit (args.deploy === true). GATE: PASS.\n\nTASK:\n${TASK}\n\nCONTEXT:\n${CONTEXT}\n\n=== WHAT SHIPPED ===\n${plan.summary}\n\n=== GATE SUMMARY ===\n${gate.summary}`

// ---------------- orchestration ----------------
phase('Research')
const research = await agent(researchPrompt, { agentType: 'researcher', label: 'researcher' })
log('Research done — feeding the manager for task division.')

phase('Plan')
const plan = await agent(planPrompt(research), { schema: PLAN_SCHEMA, agentType: 'manager', label: 'manager:plan' })
log(`Plan ready: ${plan.summary}`)
log(`Files to change: ${(plan.filesToChange || []).join(', ') || '(coder to determine)'}`)

let design = null
if (plan.needsDesign) {
  phase('Design')
  design = await agent(designPrompt(plan), { agentType: 'designer', label: 'designer' })
  log('Design spec ready — feeding the coder.')
} else {
  log('No UI in this task — skipping the design phase.')
}

let feedback = null, lastCoder = null, lastGate = null, passed = false, iters = 0
for (let i = 1; i <= MAX; i++) {
  iters = i
  phase(`Build (iter ${i})`)
  lastCoder = await agent(coderPrompt(plan, design, feedback, i), { agentType: 'coder', label: `coder:iter${i}` })

  const rbPhase = `Review + Red/Blue + Test (iter ${i})`
  phase(rbPhase)
  const [review, sec, hack, test] = await parallel([
    () => agent(reviewPrompt(lastCoder),   { agentType: 'code-reviewer', phase: rbPhase, label: `review:iter${i}` }),
    () => agent(securityPrompt(lastCoder), { agentType: 'security',      phase: rbPhase, label: `security:iter${i}` }),
    () => agent(hackerPrompt(lastCoder),   { agentType: 'hacker',        phase: rbPhase, label: `hacker:iter${i}` }),
    () => agent(testerPrompt(lastCoder),   { agentType: 'tester',        phase: rbPhase, label: `tester:iter${i}` }),
  ])

  phase(`Gate (iter ${i})`)
  lastGate = await agent(gatePrompt(plan, lastCoder, review || '(no review report)', sec || '(no security report)', hack || '(no hacker report)', test || '(no tester report)'),
    { schema: GATE_SCHEMA, agentType: 'manager', label: `manager:gate${i}` })
  log(`Gate iter ${i}: ${lastGate.verdict} | hackerClean=${lastGate.hackerClean} | testerGreen=${lastGate.testerGreen}`)

  if (lastGate.verdict === 'PASS' && lastGate.hackerClean && lastGate.testerGreen) { passed = true; break }
  feedback = lastGate
}

let deployResult = null
if (passed && DEPLOY) {
  phase('Deploy')
  log('Gate PASSed and deploy is explicitly authorized — deploying + smoke-testing.')
  deployResult = await agent(deployPrompt(plan, lastGate), { agentType: 'deployer', label: 'deployer' })
} else if (passed) {
  log(`✅ Shippable after ${iters} iteration(s). Not deploying — deploy is human-gated (pass args.deploy=true to ship). Review the git diff first.`)
} else {
  log(`⚠️ Did not fully pass within ${MAX} iterations — returning best state + open blockers.`)
}

return {
  status: passed ? 'PASS' : 'NOT_PASSED',
  iterations: iters,
  plan,
  designSpec: design,
  finalGate: lastGate,
  lastCoderReport: lastCoder,
  deploy: deployResult,
}
