/*
  Author: Runor Ewhro
  Description: Generates offline rotation catalogues and preambles, then
               validates translated programs through application owners.
*/

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { initGameData } from '@/data/gameData'

const [input, output, baseline] = process.argv.slice(2)
if (!input || !output) throw new Error('Expected INPUT_EXPORT OUTPUT_CATALOGUE')
globalThis.fetch = async (input) => {
  const url = String(input)
  if (!url.startsWith('/data/')) throw new Error(`Unexpected data request ${url}`)
  return new Response(readFileSync(resolve('public', url.slice(1))))
}
await initGameData({ mode: 'live' })
const { prepareCombatScenario, executeCombatScenarioProgram } = await import('@/engine/pipeline/combatScenario')
const { parseCombatScenario } = await import('@/engine/runtime/schema')
const { visibleRotMembers, makeConditionChoices } = await import('@/modules/simulation/surfaces/rotation/shared/catalog')
const { buildPreambleEntries } = await import('@/modules/simulation/surfaces/rotation/program-editor/model/nodeAuthoring')
const { editorSectionsToRotation } = await import('@/modules/simulation/surfaces/rotation/program-editor/model/toRotationNodes')
const exported = JSON.parse(readFileSync(input, 'utf8'))
const scenario = (exported.payload ?? exported).rotation.scenario
const parsed = parseCombatScenario(scenario)
if (!parsed.success) throw new Error(JSON.stringify(parsed.error))
const prepared = prepareCombatScenario(scenario)
const members = visibleRotMembers(prepared.subjectRuntime, prepared.runtimesById)
const choices = makeConditionChoices(members, prepared.subjectRuntime, scenario.target.id)
const children = buildPreambleEntries({ condChoices: choices, existing: [], activeId: prepared.subjectRuntime.id, startId: scenario.initialOnFieldMemberId })
const preamble = editorSectionsToRotation([{ id: 'preamble', title: 'Preamble', meta: '', children }], [])[0].items
const run = executeCombatScenarioProgram(prepared)
const errors: string[] = []
function walk(nodes, attached = false) {
  for (const node of nodes) {
    if (node.type === 'feature') {
      const member = members.find(m => m.id === (node.resonatorId ?? scenario.contextMemberId))
      if (!member?.features.some(f => f.id === node.featureId)) errors.push(`Unknown feature ${node.resonatorId}:${node.featureId}`)
      if (attached && node.attached) errors.push(`Nested attachment ${node.id}`)
      if (node.attached) { walk(node.attached.conditions, true); walk(node.attached.features, true) }
    }
    if (node.type === 'condition') for (const change of node.changes) {
      if (!choices.some(c => c.state.path === change.path && (change.path.startsWith('enemy.') || change.path === 'runtime.rotation.activeResonatorId' || c.resonatorId === (change.resonatorId ?? node.resonatorId)))) errors.push(`Unknown condition ${JSON.stringify(change)}`)
    }
    if (node.items) walk(node.items)
    for (const fork of Object.values(node.passForks ?? {})) walk(fork)
  }
}
walk(scenario.program.program)
if (!isDeepStrictEqual(parsed.data.program.program, scenario.program.program)) errors.push('Program changed in schema round trip')
if (baseline) {
  const original = JSON.parse(readFileSync(baseline, 'utf8'))
  const withoutProgram = value => {
    const clone = structuredClone(value)
    ;(clone.payload ?? clone).rotation.scenario.program.program = []
    return clone
  }
  if (!isDeepStrictEqual(withoutProgram(original), withoutProgram(exported))) errors.push('Non-program export fields changed')
  if (errors.length) throw new Error(errors.join('\n'))
}
writeFileSync(output, JSON.stringify({
  preamble,
  conditions: choices.map(({ resonatorId, label, sourceName, description, dscrPrms, state }) => ({ resonatorId, label, sourceName, description, dscrPrms, state })),
  members: members.map(({ id, name, skills, features }) => ({ id, name, skills, features })),
  validation: { errors },
  execution: { entries: run?.entries.map(({ nodeId, resonatorId, feature, multiplier, avg, aggregationType, effectiveStats, loopRuns }) => ({ nodeId, resonatorId, featureId: feature.id, multiplier, avg, aggregationType, effectiveStats, loopRuns })),
    inspection: run?.inspection.map(({ nodeId, executed, value, activeResonatorId, loopRuns }) => ({ nodeId, executed, value, activeResonatorId, loopRuns })) },
}, null, 2) + '\n')
console.log(JSON.stringify({ members: members.map(m => m.name), preamble: preamble.length, entries: run?.entries.length, output }))
