export const meta = {
  name: 'portfolio-audit',
  description: 'Rate, analyse and produce an improvement plan for one or more apps through founder → designer → developer lenses, each lens an independent agent, with dedicated synthesis',
  whenToUse: 'Auditing an app or repo. Pass args: {targets: [{name, path}]} where path is a local checkout. One target per session keeps daily budget use under 50%.',
  phases: [
    { title: 'Rate', detail: 'founder, designer, developer lenses in parallel per target' },
    { title: 'Deepen', detail: 'security, performance, accessibility, tests' },
    { title: 'Synthesize', detail: 'one improvement plan per target' },
  ],
}

const targets = args?.targets ?? []
if (!targets.length) throw new Error('args.targets required: [{name, path}]')

const HALF = budget.total ? Math.floor(budget.total * 0.5) : null
const halted = () => HALF !== null && budget.spent() >= HALF

const LENSES = [
  { key: 'founder', agent: 'founder-lens', ask: 'Rate this product as a founder per your protocol.' },
  { key: 'ux', agent: 'ux-architect', ask: 'Audit the information architecture: page inventory with keep/merge/kill, flow gaps, state coverage.' },
  { key: 'tech', agent: 'tech-leader', ask: 'Give technical direction verdicts: stack consolidation, debt priorities, build-vs-buy.' },
]
const DEEP = [
  { key: 'security', agent: 'security-auditor', ask: 'Audit for security findings per your protocol.' },
  { key: 'a11y', agent: 'accessibility-auditor', ask: 'Audit the UI code for WCAG 2.2 AA violations.' },
  { key: 'tests', agent: 'test-planner', ask: 'Map coverage gaps and the minimum merge gate.' },
]

const audits = await pipeline(
  targets,
  t => parallel(LENSES.map(l => () =>
    agent(`Target: ${t.name} at ${t.path}. ${l.ask}`,
      { agentType: l.agent, label: `${t.name}:${l.key}`, phase: 'Rate' })
      .then(r => ({ lens: l.key, report: r }))))
    .then(rs => ({ target: t, lenses: rs.filter(Boolean) })),
  (a, t) => {
    if (halted()) { log(`Budget governor: skipping deep pass for ${t.name}`); return a }
    return parallel(DEEP.map(d => () =>
      agent(`Target: ${t.name} at ${t.path}. ${d.ask}`,
        { agentType: d.agent, label: `${t.name}:${d.key}`, phase: 'Deepen' })
        .then(r => ({ lens: d.key, report: r }))))
      .then(rs => ({ ...a, lenses: [...a.lenses, ...rs.filter(Boolean)] }))
  },
  (a, t) => agent(
    `Merge these audit lenses for ${t.name} into: scores per lens, top findings, and a ranked improvement plan (top 10 by leverage):\n\n` +
    a.lenses.map(l => `# ${l.lens}\n${l.report}`).join('\n\n'),
    { agentType: 'portfolio-synthesizer', label: `${t.name}:plan`, phase: 'Synthesize' })
    .then(plan => ({ name: t.name, plan })),
)

return { audits: audits.filter(Boolean), tokens_spent: budget.spent(), budget_halted: halted() }
