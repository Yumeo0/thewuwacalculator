/*
  Author: Runor Ewhro
  Description: One-shot phase-3 helper. Strips the '.ts' extension from
               '@core/*' module specifiers inside the core package so `tsc`
               can emit JavaScript. Relative '.ts' specifiers stay as-is and
               are rewritten by `rewriteRelativeImportExtensions`; aliases are
               finalized afterwards by `tsc-alias`.
*/

import { readFileSync, writeFileSync } from 'node:fs'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const roots = [join(repoRoot, 'packages', 'core', 'src')]
const PATTERN = /(['"])(@core\/[^'"]+)\.ts\1/g

function walk(dir, onChange) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(path, onChange)
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      const before = readFileSync(path, 'utf8')
      const after = before.replace(PATTERN, '$1$2$1')
      if (after !== before) onChange(path, before, after)
    }
  }
}

let changedFiles = 0
let changedSpecifiers = 0
for (const root of roots) {
  walk(root, (path, before, after) => {
    changedSpecifiers += (before.match(PATTERN) ?? []).length
    changedFiles += 1
    writeFileSync(path, after)
    console.log(path)
  })
}

console.log(`stripped .ts from ${changedSpecifiers} @core specifiers in ${changedFiles} files`)
