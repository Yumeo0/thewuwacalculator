/*
  One-shot codemod for the library extraction (Phase 2).

  core mode: rewrites core-internal `@/...` imports to the `@core/...` alias and
             fixes relative paths to /public that gained one directory level.
  app mode:  rewrites app imports of extracted modules to `@wuwacalc/core/...`,
             and `@/engine/echoParser/...` to `@/echoParser/...`.
*/

import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const ROOT = process.cwd()
const CODE_EXTENSIONS = new Set(['.ts', '.tsx'])

const CORE_REWRITES = [
  ['@/domain', '@core/domain'],
  ['@/data/catalog', '@core/data/catalog'],
  ['@/data/gameData', '@core/data/gameData'],
  ['@/data/scoring', '@core/data/scoring'],
  ['@/data/coreEnvironment', '@core/data/coreEnvironment'],
  ['@/engine', '@core/engine'],
  ['@/shared/lib/WorkerChannel', '@core/shared/lib/WorkerChannel'],
  ['@/shared/lib/number', '@core/shared/lib/number'],
]

const APP_REWRITES = [
  ['@/engine/echoParser', '@/echoParser'],
  ['@/domain', '@wuwacalc/core/domain'],
  ['@/data/catalog', '@wuwacalc/core/data/catalog'],
  ['@/data/gameData', '@wuwacalc/core/data/gameData'],
  ['@/data/scoring', '@wuwacalc/core/data/scoring'],
  ['@/data/coreEnvironment', '@wuwacalc/core/data/coreEnvironment'],
  ['@/engine', '@wuwacalc/core/engine'],
  ['@/shared/lib/WorkerChannel', '@wuwacalc/core/shared/lib/WorkerChannel'],
  ['@/shared/lib/number', '@wuwacalc/core/shared/lib/number'],
  ['@core', '@wuwacalc/core'],
]

function listFiles(target, out = []) {
  const absolute = path.join(ROOT, target)
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const next = path.join(absolute, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      listFiles(path.relative(ROOT, next), out)
      continue
    }
    if (CODE_EXTENSIONS.has(path.extname(entry.name))) out.push(next)
  }
  return out
}

function specifiersOf(sourceFile) {
  const found = []
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      found.push(node.moduleSpecifier)
    } else if (ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteralLike(node.arguments[0])) {
      found.push(node.arguments[0])
    } else if (ts.isImportTypeNode(node)
      && node.argument && ts.isLiteralTypeNode(node.argument)
      && ts.isStringLiteralLike(node.argument.literal)) {
      found.push(node.argument.literal)
    } else if (ts.isNewExpression(node)
      && node.expression.getText(sourceFile) === 'URL'
      && node.arguments && node.arguments.length >= 1
      && ts.isStringLiteralLike(node.arguments[0])) {
      found.push(node.arguments[0])
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

function isInside(child, parent) {
  const relative = path.relative(parent, child)
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function rewriteSpecifier(text, rewrites) {  for (const [from, to] of rewrites) {
    if (text === from || text.startsWith(`${from}/`) || text.startsWith(from)) {
      return to + text.slice(from.length)
    }
  }
  return null
}

function processFile(file, rewrites, isCore) {
  const text = fs.readFileSync(file, 'utf8')
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const replacements = []

  for (const spec of specifiersOf(sourceFile)) {
    const raw = spec.getText(sourceFile)
    const inner = raw.slice(1, -1)
    const quote = raw[0]

    if (isCore && inner.startsWith('.')) {
      const queryIndex = inner.indexOf('?')
      const pathPart = queryIndex === -1 ? inner : inner.slice(0, queryIndex)
      const suffix = queryIndex === -1 ? '' : inner.slice(queryIndex)
      const publicIndex = pathPart.lastIndexOf('/public/')
      if (publicIndex !== -1) {
        const target = path.join(ROOT, pathPart.slice(publicIndex + 1))
        const relative = path.relative(path.dirname(file), target).split(path.sep).join('/')
        replacements.push({
          start: spec.getStart(sourceFile),
          end: spec.getEnd(),
          next: `${quote}${relative.startsWith('.') ? relative : `./${relative}`}${suffix}${quote}`,
        })
      }
      continue
    }

    const next = rewriteSpecifier(inner, rewrites)
    if (!next) continue
    replacements.push({
      start: spec.getStart(sourceFile),
      end: spec.getEnd(),
      next: `${quote}${next}${quote}`,
    })
  }

  if (!replacements.length) return text
  let output = text
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    output = output.slice(0, replacement.start) + replacement.next + output.slice(replacement.end)
  }
  fs.writeFileSync(file, output)
  return output
}

const mode = process.argv[2]
if (mode !== 'core' && mode !== 'app') {
  console.error('usage: node codemod.mjs <core|app>')
  process.exit(1)
}

const files = mode === 'core' ? listFiles('packages/core/src') : listFiles('src')
let changed = 0
const leftovers = []

for (const file of files) {
  const before = fs.readFileSync(file, 'utf8')
  const after = processFile(file, mode === 'core' ? CORE_REWRITES : APP_REWRITES, mode === 'core')
  if (after !== before) changed += 1

  if (mode === 'core') {
    const sourceFile = ts.createSourceFile(file, after, ts.ScriptTarget.Latest, true)
    for (const spec of specifiersOf(sourceFile)) {
      const inner = spec.getText(sourceFile).slice(1, -1)
      if (inner.startsWith('@/')) {
        leftovers.push(`${path.relative(ROOT, file)} -> ${inner}`)
      }
    }
  }
}

console.log(`${mode}: rewrote ${changed} of ${files.length} files`)
if (leftovers.length) {
  console.error(`${leftovers.length} unresolved @/ specifiers left in core:`)
  for (const line of leftovers) console.error(`- ${line}`)
  process.exitCode = 1
}
