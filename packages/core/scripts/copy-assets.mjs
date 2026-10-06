/*
  Author: Runor Ewhro
  Description: Copies non-TS runtime assets that `tsc` does not emit into the
               package dist folder (for example the portrait surface lookup
               that app code imports through the package path).
*/

import { cpSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgDir = dirname(dirname(fileURLToPath(import.meta.url)))
const srcDir = join(pkgDir, 'src')
const distDir = join(pkgDir, 'dist')
const COPY_EXTS = new Set(['.json'])

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const from = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === '__benchmarks__') continue
      walk(from)
      continue
    }
    if (!COPY_EXTS.has(entry.name.slice(entry.name.lastIndexOf('.')))) continue
    const to = join(distDir, relative(srcDir, from))
    cpSync(from, to)
  }
}

walk(srcDir)
console.log('core assets copied')
