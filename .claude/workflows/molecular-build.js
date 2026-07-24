export const meta = {
  name: 'molecular-build',
  description: 'Decompose a goal into molecular tasks, execute in parallel waves of single-purpose agents, synthesize per vertical, verify — halting at 50% of the granted token budget',
  whenToUse: 'Building or improving any feature/app with the grassroot agent org. Pass args: {goal: "...", verticals?: ["design","engineering",...]}',
  phases: [
    { title: 'Decompose', detail: 'feature-decomposer emits waves of molecules' },
    { title: 'Execute', detail: 'one agent per molecule, waves in parallel' },
    { title: 'Synthesize', detail: 'dedicated synthesizer per vertical' },
    { title: 'Verify', detail: 'quality verdict on the merged result' },
  ],
}

const goal = args?.goal ?? String(args ?? '')
if (!goal) throw new Error('args.goal required')

// Budget governor: never spend more than half of what the user granted this turn.
// With no explicit grant, cap the run at 24 molecules as a hard economy ceiling.
const HALF = budget.total ? Math.floor(budget.total * 0.5) : null
const halted = () => HALF !== null && budget.spent() >= HALF
const MAX_MOLECULES = 24

const PLAN = {
  type: 'object', required: ['waves'],
  properties: {
    waves: { type: 'array', items: { type: 'array', items: {
      type: 'object', required: ['id', 'vertical', 'agent', 'task', 'verify_by'],
      properties: {
        id: { type: 'string' }, vertical: { type: 'string' },
        agent: { type: 'string' }, task: { type: 'string' },
        verify_by: { type: 'string' },
      },
    } } },
  },
}

phase('Decompose')
const plan = await agent(
  `Decompose this goal into molecular tasks per your protocol. Goal: ${goal}\n` +
  `Assign each molecule to exactly one agent from .claude/agents/ (read the directory listing for the roster). ` +
  `Hard cap: ${MAX_MOLECULES} molecules total — prioritize by leverage and drop the rest, listing dropped items.`,
  { agentType: 'feature-decomposer', schema: PLAN, phase: 'Decompose' },
)

const molecules = plan.waves.flat().slice(0, MAX_MOLECULES)
log(`${molecules.length} molecules in ${plan.waves.length} waves`)

phase('Execute')
const results = []
for (const [i, wave] of plan.waves.entries()) {
  if (halted()) { log(`Budget governor: halting before wave ${i + 1} — 50% of granted budget spent`); break }
  const done = await parallel(wave.map(m => () =>
    agent(`Your molecule (${m.id}): ${m.task}\nGoal context: ${goal}\nDo only this molecule.`,
      { agentType: m.agent, label: `${m.vertical}:${m.id}`, phase: 'Execute' })
      .then(r => ({ ...m, result: r }))))
  results.push(...done.filter(Boolean))
  log(`wave ${i + 1}/${plan.waves.length} done (${results.length} molecules complete)`)
}

phase('Synthesize')
const SYNTH = {
  strategy: 'strategy-synthesizer', finance: 'strategy-synthesizer',
  product: 'strategy-synthesizer', design: 'design-synthesizer',
  engineering: 'engineering-synthesizer', quality: 'quality-synthesizer',
  growth: 'gtm-synthesizer',
}
const byVertical = {}
for (const r of results) (byVertical[r.vertical] ??= []).push(r)
const syntheses = await parallel(Object.entries(byVertical).map(([v, items]) => () =>
  agent(`Synthesize these ${v} molecule outputs for goal "${goal}":\n\n` +
    items.map(m => `## ${m.id} (${m.agent})\n${m.result}`).join('\n\n'),
    { agentType: SYNTH[v] ?? 'portfolio-synthesizer', label: `synth:${v}`, phase: 'Synthesize' })
    .then(s => ({ vertical: v, synthesis: s }))))

phase('Verify')
const master = await agent(
  `Merge these vertical syntheses into the master brief for goal "${goal}":\n\n` +
  syntheses.filter(Boolean).map(s => `# ${s.vertical}\n${s.synthesis}`).join('\n\n'),
  { agentType: 'portfolio-synthesizer', phase: 'Verify' },
)

return {
  master,
  molecules_done: results.length,
  molecules_planned: molecules.length,
  budget_halted: halted(),
  tokens_spent: budget.spent(),
}
