// Extract a traced rotation from a downloaded Riley Calc shared bundle.
// Usage: node tools/analysis/extractRileyRotation.mjs BUNDLE URL OUTPUT
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

const [bundle, url, output] = process.argv.slice(2)
if (!bundle || !url || !output) throw new Error('Expected BUNDLE URL OUTPUT')
const api = await import(pathToFileURL(resolve(bundle)).href)
const tag = new URLSearchParams(new URL(url).hash.slice(1)).get('team')
const digits = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
if (!tag || !/^[0-9a-zA-Z]+$/.test(tag)) throw new Error('Expected a compact team tag')
let bits = 0n
for (const character of tag) bits = bits * 62n + BigInt(digits.indexOf(character))
const key = `t${bits & 0x3fffn}`
bits >>= 14n
const team = api.teamAt(key)
if (!team) throw new Error(`Unknown team ${key}`)
const members = team.loadouts.map((loadout, i) => api.member(loadout, team.mdps[i]))
const picks = members.map(() => {
  const packed = Number(bits & 0xfffffn)
  bits >>= 20n
  return { weapon: packed & 7, echo: packed >> 3 & 7, mainstat: packed >> 6 & 63,
    sequence: packed >> 12 & 7, refine: packed >> 15 & 7,
    matrix: Boolean(packed & 1 << 18), highSubs: Boolean(packed & 1 << 19) }
})
const run = api.runTeam(key, members, members.map((m, i) => api.comboOf(m.loadout, picks[i])), true)
const snapshot = (s) => Object.fromEntries(['action', 'member', 'slot', 'triggered', 'source', 'mv', 'avg', 'frame', 'frames', 'hitAt', 'starts', 'ends', 'tag', 'heldLocal', 'heldGlobal', 'heldEnemy', 'forteBefore', 'forte'].map(k => [k, s[k]]))
const result = { url, bundleSha256: createHash('sha256').update(await readFile(bundle)).digest('hex'),
  teamKey: key, members: members.map((m, i) => ({ name: m.name, mode: m.loadout.mode?.name, picks: picks[i] })),
  sectionSeconds: run.sectionSeconds, rotationLines: run.rotationLines.map(lines => lines.map(l => ({
    id: l.id, aggregate: Boolean(l.aggregate), mv: l.mv,
    snap: snapshot(l.snap), ...(l.members ? { members: l.members.map(snapshot) } : {}),
  }))) }
await writeFile(output, JSON.stringify(result, (key, value) => {
  if (value && typeof value === 'object' && 'hookFns' in value) return { name: value.name, cast: value.cast, type: value.type, node: value.node, animFrames: value.animFrames }
  if (value instanceof Map) return Object.fromEntries(value)
  if (value instanceof Set) return [...value]
  return value
}, 2) + '\n')
console.log(JSON.stringify({ team: result.members, runs: result.rotationLines.length, output }, null, 2))
