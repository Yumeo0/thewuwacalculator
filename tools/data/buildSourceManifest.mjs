import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const publicDir = fileURLToPath(new URL('../../public/', import.meta.url))

// Keep in sync with GAME_DATA_SCHEMA_VERSION in packages/core/src/data/gameData/constants.ts.
const DATA_SCHEMA_VERSION = 1

export async function buildSourceManifest(mode) {
  const root = join(publicDir, 'data', mode)
  const [resonators, echoes, enemies, weapons, sets] = await Promise.all([
    'resonators/sources.json',
    'echoes/sources.json',
    'enemies/sources.json',
    'weapons/sources.json',
    'sonata/effects.json',
  ].map((path) => readFile(join(root, path), 'utf8').then(JSON.parse)))
  const packages = [...resonators, ...echoes, ...enemies, ...weapons]
  const sources = [
    ...packages.map((entry) => entry.source),
    ...sets.map((entry) => ({ type: 'echoSet', id: String(entry.id) })),
  ].sort((left, right) => `${left.type}:${left.id}`.localeCompare(`${right.type}:${right.id}`))
  const featureIds = [...new Set(packages.flatMap((entry) =>
    (entry.features ?? []).map((feature) => feature.id)))].sort()
  await writeFile(join(root, 'source-manifest.json'), JSON.stringify({
    version: DATA_SCHEMA_VERSION,
    sources,
    featureIds,
  }))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await Promise.all(['beta', 'live'].map(buildSourceManifest))
}
