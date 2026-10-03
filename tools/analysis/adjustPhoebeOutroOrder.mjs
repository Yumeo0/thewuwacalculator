// Place outgoing damage after the on-field handoff in the saved Phoebe rotation.
// Usage: node tools/analysis/adjustPhoebeOutroOrder.mjs INPUT OUTPUT
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'

const [input, output] = process.argv.slice(2)
if (!input || !output) throw new Error('Expected INPUT OUTPUT')
const exported = JSON.parse(readFileSync(input, 'utf8'))
const program = (exported.payload ?? exported).rotation.scenario.program.program
const loopStart = program.findIndex(n => n.type === 'loop' && n.kind === 'start' && n.runs === 4)
const loopEnd = program.findIndex((n, i) => i > loopStart && n.type === 'loop' && n.kind === 'end')
assert(loopStart >= 0 && loopEnd > loopStart, 'Expected the four-run loop')
const loop = program[loopStart]
assert.deepEqual(Object.keys(loop.passForks ?? {}).sort(), ['1', '2', '3', '4'])
const activePath = 'runtime.rotation.activeResonatorId'
const hitRoad = 'runtime.state.controls.team:1509:hit_the_road:active'
const hyvatia = 'runtime.state.controls.echo:6000189:main:active'
function activeTo(node, target) {
  return node.type === 'condition' && node.changes.some(change => change.path === activePath && change.value === target)
}
function ending(node, path) {
  return node.type === 'condition' && node.changes.some(change => change.path === path && change.value === false)
}
function shiftOutro(body, featureId, target, endPaths = []) {
  const outroAt = body.findIndex(node => node.type === 'feature' && node.featureId === featureId)
  assert(outroAt >= 0 && body.filter(node => node.type === 'feature' && node.featureId === featureId).length === 1, `Expected one ${featureId}`)
  const nextFeature = body.findIndex((node, i) => i > outroAt && node.type === 'feature')
  const end = nextFeature < 0 ? body.length : nextFeature
  const swapAt = body.findIndex((node, i) => i > outroAt && i < end && activeTo(node, target))
  if (swapAt < 0) {
    const priorFeature = body.findLastIndex((node, i) => i < outroAt && node.type === 'feature')
    assert(body.some((node, i) => i > priorFeature && i < outroAt && activeTo(node, target)), `Missing ${target} handoff near ${featureId}`)
    for (const path of endPaths) {
      assert(body.some((node, i) => i > priorFeature && i < outroAt && ending(node, path)), `Missing ${path} expiry before ${featureId}`)
    }
    return false
  }
  const swap = body.splice(swapAt, 1)[0]
  const expiries = endPaths.map(path => {
    const next = body.findIndex((node, i) => i > outroAt && i < end - 1 && ending(node, path))
    assert(next >= 0, `Missing ${path} expiry after ${featureId}`)
    return body.splice(next, 1)[0]
  })
  body.splice(outroAt, 0, swap, ...expiries)
  return true
}
const bodies = [program.slice(loopStart + 1, loopEnd), ...Object.values(loop.passForks)]
let moved = 0
for (const body of bodies) {
  if (shiftOutro(body, 'damage:1509:outro', '1506')) moved++
  if (shiftOutro(body, 'damage:1506:outro', '1502', [hitRoad, hyvatia])) moved++
}
program.splice(loopStart + 1, loopEnd - loopStart - 1, ...bodies[0])
const obsolete = 'runtime.state.controls.resonator:1509:spectral_analysis:active'
const oldAt = program.findIndex(node => node.type === 'condition' && node.editorSection === 'preamble' && node.changes.some(change => change.path === obsolete))
if (oldAt >= 0) {
  assert(program[oldAt].changes.every(change => change.path === obsolete && change.value === false), 'Unexpected Spectral Analysis preamble write')
  program.splice(oldAt, 1)
}
writeFileSync(output, JSON.stringify(exported) + '\n')
console.log(JSON.stringify({ output, movedOutros: moved, removedObsoleteCondition: oldAt >= 0 }))
