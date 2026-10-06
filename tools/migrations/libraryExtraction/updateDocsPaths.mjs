/*
  Author: Runor Ewhro
  Description: One-shot phase-3 helper. Rewrites documentation links and code
               references from the pre-extraction app paths to the core
               package paths. App-owned paths (src/data/content, src/modules,
               src/shared, ...) are intentionally untouched.
*/

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const REPLACEMENTS = [
  ['src/data/coreEnvironment.ts', 'packages/core/src/data/coreEnvironment.ts'],
  ['src/data/gameData', 'packages/core/src/data/gameData'],
  ['src/data/catalog', 'packages/core/src/data/catalog'],
  ['src/data/scoring', 'packages/core/src/data/scoring'],
  ['src/domain/', 'packages/core/src/domain/'],
  ['src/engine/', 'packages/core/src/engine/'],
]

const files = [
  join(repoRoot, 'README.md'),
  ...readdirSync(join(repoRoot, 'docs'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => join(repoRoot, 'docs', name)),
]

for (const file of files) {
  let text = readFileSync(file, 'utf8')
  let changed = 0
  for (const [from, to] of REPLACEMENTS) {
    const parts = text.split(from)
    changed += parts.length - 1
    text = parts.join(to)
  }
  if (changed > 0) {
    writeFileSync(file, text)
    console.log(`${changed} refs updated in ${file.replace(repoRoot + '\\', '')}`)
  }
}
