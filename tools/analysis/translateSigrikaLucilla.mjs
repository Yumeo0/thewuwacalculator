// Reviewed, explicit action mapping; no name guessing or generated condition IDs.
// Usage: node tools/analysis/translateSigrikaLucilla.mjs INPUT CATALOGUE REFERENCE OUTPUT
import { readFileSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const [input, cataloguePath, referencePath, output] = process.argv.slice(2)
if (!output) throw new Error('Expected INPUT CATALOGUE REFERENCE OUTPUT')
const exported = JSON.parse(readFileSync(input, 'utf8'))
const catalogue = JSON.parse(readFileSync(cataloguePath, 'utf8'))
const reference = JSON.parse(readFileSync(referencePath, 'utf8'))
const scenario = (exported.payload ?? exported).rotation.scenario
assert.deepEqual(reference.members.map(m => m.name), ['Shorekeeper', 'Lucilla', 'Sigrika'])
assert.equal(reference.members[1].mode, 'Resonance Mode - Echo')
assert.equal(reference.rotationLines.length, 4)
assert(scenario.team.members.every(m => m.progression.sequence === 0), 'Recipe reviewed for S0')
const ids = { Sigrika: '1412', Lucilla: '1109', Shorekeeper: '1505', 'Tune Break': '1412' }
const keys = {
  vitality: ['1412', 'resonator:1412:soliskin_vitality:value'],
  gift: ['1412', 'resonator:1412:innate_gift:stacks'],
  blessing: ['1412', 'inherent:1412:lvl70:blessing_of_runes'],
  cipherEcho: ['1412', 'weapon:21040066:passive:echo'],
  cipherAero: ['1412', 'weapon:21040066:passive:aero'],
  sound: ['1412', 'echoSet:29:bonus:soundOfTrueName5pc'],
  mode: ['1109', 'resonator:1109:mode:value'],
  clear: ['1109', 'resonator:1109:clear_as_day:active'],
  slow: ['1109', 'inherent:1109:lvl50:active'],
  zoom: ['1109', 'resonator:1109:zoom:stacks'],
  montage: ['1109', 'team:1109:montage:active'],
  heron: ['1109', 'echo:6000052:main:active'],
  freezeGlacio: ['1109', 'weapon:21050086:passive:glacio'],
  freezeTeam: ['1109', 'weapon:21050086:passive:team_atk'],
  moonlit: ['1109', 'echoSet:8:bonus:moonlit5'],
  inner: ['1505', 'resonator:1505:inner_stellarealm:active'],
  supernal: ['1505', 'resonator:1505:supernal_stellarealm:active'],
  binary: ['1505', 'resonator:1505:binary_butterfly:active'],
  gravity: ['1505', 'inherent:1505:lvl70:active'],
  fallacy: ['1505', 'echo:6000060:main:active'],
  symphony: ['1505', 'weapon:21050036:passive:active'],
  glow: ['1505', 'echoSet:7:bonus:rejuvenating5'],
  chafe: ['1109', 'enemy.combat.glacioChafe'],
}
const definitions = Object.fromEntries(Object.entries(keys).map(([key, [owner, control]]) => {
  const path = control.startsWith('enemy.') ? control : `runtime.state.controls.${control}`
  const choice = catalogue.conditions.find(c => (path.startsWith('enemy.') || c.resonatorId === owner) && c.state.path === path)
  assert(choice, `Missing catalogue condition ${key}`)
  return [key, choice]
}))
let serial = 0
const id = kind => `riley:sigrika-lucilla:${kind}:${++serial}`
const condition = (key, value, type = 'set') => {
  const { resonatorId, state } = definitions[key]
  return { id: id('condition'), type: 'condition', resonatorId, enabled: true,
    changes: [{ type, path: state.path, value, ...(state.path.startsWith('enemy.') ? {} : { resonatorId }) }] }
}
const feature = (owner, featureId, multiplier = 1) => {
  assert(catalogue.members.find(m => m.id === owner)?.features.some(f => f.id === featureId), `Missing feature ${owner}:${featureId}`)
  return { id: id('feature'), type: 'feature', resonatorId: owner, enabled: true, featureId, multiplier }
}
const attach = (node, features = [], conditions = []) => ({ ...node, attached: { features, conditions } })
const note = text => ({ id: id('note'), type: 'note', text })
const preamble = structuredClone(catalogue.preamble)
for (const node of preamble) {
  node.id = id('preamble')
  for (const change of node.changes ?? []) {
    if (change.path === definitions.mode.state.path) change.value = 'echo'
    if (change.path === 'runtime.rotation.activeResonatorId') change.value = '1505'
  }
}
const state = Object.fromEntries(Object.entries(definitions).map(([key, c]) => [key, c.state.defaultValue]))
state.mode = 'echo'
let active = '1505', nodes = [], frame = 0, nextHeal = Infinity
const timers = new Map()
const blessingEchoes = new Set(), vitalityEchoes = new Set()
const provenance = []
function set(key, value, seconds) {
  if (state[key] !== value && String(state[key]) !== String(value)) {
    nodes.push(condition(key, value))
    state[key] = value
  }
  if (seconds !== undefined) timers.set(key, frame + seconds * 60)
}
function add(key, amount, max = Infinity) {
  const gain = Math.min(max, Number(state[key]) + amount) - Number(state[key])
  if (gain) { nodes.push(condition(key, gain, 'add')); state[key] = Number(state[key]) + gain }
}
function handoff(owner) {
  if (active === owner) return
  nodes.push({ id: id('handoff'), type: 'condition', enabled: true,
    changes: [{ type: 'set', path: 'runtime.rotation.activeResonatorId', value: owner }] })
  active = owner
}
function echoCast(name) {
  if (!blessingEchoes.has(name)) { add('blessing', 1, 6); blessingEchoes.add(name) }
  if (!vitalityEchoes.has(name)) { add('vitality', 1, 6); vitalityEchoes.add(name) }
}
function heal() {
  nodes.push(feature('1505', 'damage:1505015'))
  set('glow', true, 30)
}
function advance(to) {
  // Timed effects end before the next action. Healing ticks are retained as
  // real features, without pretending their whole duration is one cast.
  for (;;) {
    const expiry = Math.min(...timers.values())
    const next = Math.min(expiry, nextHeal)
    if (next > to) break
    frame = next
    for (const [key, at] of timers) if (at <= next) { timers.delete(key); set(key, key === 'chafe' ? 0 : false) }
    if (nextHeal <= next) { heal(); nextHeal += 180 }
  }
  frame = to
}
const mapping = {
  'Basic - Origin Calculus 1': 'damage:1505001',
  'Basic - Origin Calculus 2': 'damage:1505002',
  'Basic - Origin Calculus 3': 'damage:1505003',
  'Mid-air - Origin Calculus Plunge': 'damage:1505006',
  'Forte Heavy - Illation': 'damage:1505027',
  'Skill - Chaos Theory': 'damage:1505011',
  'Liberation - End Loop': 'damage:1505015',
  'Echo - Fallacy of No Return': 'echo:6000060:feature:echo:6000060:skill:1',
  'Intro - Clip It': 'damage:1109024',
  'Glacio Chafe - 1 Stack': 'damage:1109:negative-effect:glacio-chafe',
  'Skill - Spotlight': 'damage:1109010',
  'Liberation - Clear As Day': 'damage:1109013',
  'Basic - Tracing Forms 1': 'damage:1109014',
  'Basic - Tracing Forms 2': 'damage:1109015',
  'Basic - Tracing Forms 3': 'damage:1109016',
  'Forte Echo - Oblivion': 'damage:1109027',
  'Basic - Letting It Go': 'damage:1109017',
  'Echo - Impermanence Heron': 'echo:6000052:feature:echo:6000052:skill:1',
  'Intro - Solsworn Etymology': 'damage:1412019',
  'Echo - Nameless Explorer': 'echo:6000192:feature:echo:6000192:skill:1',
  'Basic - One, Two, Three 2': 'damage:1412002',
  'Basic - One, Two, Three 3': 'damage:1412003',
  'Basic - One, Two, Three 4': 'damage:1412004',
  'Basic - Elucidated': 'damage:1412005',
  'Forte Heavy - Schemata of Runes': 'damage:1412021',
  'Forte - Runic Chain Whip': 'damage:1412023',
  'Liberation - Where Trust Leads Me!': 'damage:1412015',
  'Forte - Runic Outburst': 'damage:1412022',
  'Forte Skill - Learn My True Name': 'damage:1412025',
  'Tune Break (Auto Generated)': 'damage:1412:tune-break',
  'Outro - In This Very Moment': 'damage:1412:outro',
  'Intro - Discernment': 'damage:1505021',
}
const runs = []
for (const [runIndex, lines] of reference.rotationLines.entries()) {
  nodes = []
  let oblivion = 0
  const actions = lines.filter(line => !line.aggregate).flatMap(line => line.members ?? [line.snap])
  for (const action of actions) {
    advance(action.frame)
    const name = action.action.name
    if (name === 'Jump' || name === 'Dodge') continue
    if (name.startsWith('Wait ')) { nodes.push(note(name)); continue }
    if (name === 'Outro - Binary Butterfly') {
      // Outro resolves after the outgoing Resonator leaves the field.
      handoff('1109')
      set('binary', true, 30)
      continue
    }
    if (name === 'Outro - Montage') {
      handoff('1412')
      set('heron', true, 15); set('moonlit', true, 15); set('montage', true, 14)
      continue
    }
    const owner = ids[action.slot]
    assert(owner, `Unknown source owner ${action.slot}`)
    const mapped = mapping[name]
    assert(mapped, `Unmapped action ${name}`)
    if (name === 'Outro - In This Very Moment') {
      handoff('1505')
      // Montage ends when its incoming Resonator is switched out. The Heron
      // and Moonlit next-character bonuses must not follow a later active slot.
      set('montage', false); set('heron', false); set('moonlit', false)
      // Discernment's overlapping cast ends the Stellarealm before the
      // outgoing hit resolves; these persistent writes also prepare its hit.
      set('inner', false); set('supernal', false); set('gravity', false)
    } else {
      handoff(owner)
    }
    if (name === 'Skill - Chaos Theory') set('symphony', true, 30)
    if (name === 'Liberation - End Loop') {
      set('inner', false); set('supernal', false); set('gravity', true)
      nextHeal = frame + 180
    }
    if (name === 'Echo - Fallacy of No Return') echoCast('Fallacy of No Return')
    if (name === 'Intro - Clip It') set('inner', true)
    if (name === 'Skill - Spotlight') set('slow', true, 30)
    if (name === 'Liberation - Clear As Day') { set('clear', true, 10); add('zoom', 1, 4) }
    if (name === 'Forte Echo - Oblivion') { echoCast(`Oblivion ${++oblivion}`); add('zoom', 1, 4) }
    if (name === 'Echo - Impermanence Heron') echoCast('Impermanence Heron')
    if (name === 'Intro - Solsworn Etymology') { set('supernal', true); set('cipherEcho', true, 15) }
    if (name === 'Echo - Nameless Explorer') { echoCast('Nameless Explorer'); set('cipherEcho', true, 15) }
    const runic = name === 'Forte - Runic Chain Whip' || name === 'Forte - Runic Outburst'
    if (runic && Number(state.vitality) >= 3) add('gift', 1, 2)
    if (name === 'Intro - Discernment') {
      nextHeal = Infinity
      set('inner', false); set('supernal', false); set('gravity', false)
      set('montage', false); set('heron', false); set('moonlit', false)
    }
    // The opener cancels the second hit of the last Shorekeeper BA2.
    const multiplier = name === 'Basic - Origin Calculus 2' && action.mv === 2386 ? 0.5 : 1
    let node = feature(owner, mapped, multiplier)
    if (name === 'Glacio Chafe - 1 Stack') node.negativeEffectStacks = 1
    if (name === 'Forte Heavy - Illation') node = attach(node, [feature(owner, 'damage:1505026', 5)])
    if (name === 'Skill - Spotlight') node = attach(node, [feature(owner, 'damage:1109008')])
    if (name === 'Intro - Discernment') node = attach(node, [feature(owner, 'damage:1505023')])
    // The kit and Riley restrict Innate Gift to the follow-up, whereas the
    // catalogue also includes Schemata itself. Override only that hit.
    if (name === 'Forte Heavy - Schemata of Runes' && Number(state.gift) > 0) node = attach(node, [], [condition('gift', 0)])
    nodes.push(node)
    provenance.push({ run: runIndex + 1, name, frame: action.frame, mv: action.mv, nodeId: node.id, featureId: mapped, multiplier })
    if (name === 'Skill - Chaos Theory') {
      set('glow', true, 30)
      nodes.push(feature(owner, 'damage:1505010', 5))
    }
    if (name === 'Liberation - End Loop' || name === 'Intro - Discernment') set('glow', true, 30)
    if (name === 'Echo - Fallacy of No Return') set('fallacy', true, 20)
    if (name === 'Intro - Clip It') {
      add('chafe', 1, 10); timers.set('chafe', frame + 15 * 60)
      set('freezeGlacio', true, 12); set('freezeTeam', true, 30)
    }
    if (['Echo - Nameless Explorer', 'Forte Heavy - Schemata of Runes', 'Forte - Runic Chain Whip', 'Liberation - Where Trust Leads Me!', 'Forte - Runic Outburst', 'Forte Skill - Learn My True Name'].includes(name)) {
      set('cipherAero', true, 6); set('sound', true, 5)
    }
    if (runic) add('vitality', -Math.min(3, Number(state.vitality)))
    if (name === 'Forte Skill - Learn My True Name') set('gift', 0)
    if (name === 'Outro - In This Very Moment') vitalityEchoes.clear()
  }
  assert.equal(oblivion, 3)
  runs.push(nodes)
}
const loopId = 'riley:sigrika-lucilla:cycle'
scenario.program.program = [
  ...preamble,
  { id: id('loop-start'), type: 'loop', enabled: true, kind: 'start', loopId, runs: 4,
    passForks: Object.fromEntries(runs.slice(1).map((body, index) => [String(index + 2), body])) },
  ...runs[0],
  { id: id('loop-end'), type: 'loop', enabled: true, kind: 'end', loopId },
]
writeFileSync(output, JSON.stringify(exported) + '\n')
writeFileSync(`${output}.mapping.json`, JSON.stringify({ url: reference.url, bundleSha256: reference.bundleSha256, actions: provenance }, null, 2) + '\n')
console.log(JSON.stringify({ output, preamble: preamble.length, runNodes: runs.map(r => r.length), mappedActions: provenance.length }))
