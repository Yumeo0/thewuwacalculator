import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const ROOT = process.cwd()
const SRC = path.join(ROOT, 'src')
const CORE_SRC = path.join(ROOT, 'packages', 'core', 'src')
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

const APP_LAYERS = new Set([
  'app',
  'application',
  'cloudflare',
  'data',
  'echoParser',
  'infra',
  'modules',
  'shared',
])

const CORE_LAYERS = new Set(['data', 'domain', 'engine', 'shared'])

const ALLOWED = {
  shared: new Set(['shared']),
  data: new Set(['data', 'shared']),
  echoParser: new Set(['echoParser', 'shared']),
  infra: new Set(['infra', 'shared']),
  application: new Set(['application', 'infra', 'data', 'shared']),
  modules: new Set(['modules', 'application', 'data', 'echoParser', 'shared']),
  app: new Set(['app', 'application', 'modules', 'infra', 'data', 'echoParser', 'shared']),
  cloudflare: new Set(['cloudflare', 'application', 'infra', 'data', 'shared']),
}

const CORE_ALLOWED = {
  shared: new Set(['shared']),
  domain: new Set(['domain', 'shared']),
  data: new Set(['data', 'domain', 'shared']),
  engine: new Set(['engine', 'data', 'domain', 'shared']),
}

const FORBIDDEN_CORE_PACKAGES = ['react', 'react-dom', 'zustand']

function listFiles(directory, result = []) {
  if (!fs.existsSync(directory)) return result
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (!['__tests__', '__benchmarks__'].includes(entry.name)) listFiles(absolute, result)
      continue
    }
    if (!CODE_EXTENSIONS.has(path.extname(entry.name))) continue
    if (/\.(?:test|spec|invariants)(?:\.[^.]+)?\.[cm]?[jt]sx?$/.test(entry.name)) continue
    result.push(absolute)
  }
  return result
}

function importSpecifiers(sourceFile) {
  const specifiers = []
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text)
    } else if (ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteralLike(node.arguments[0])) {
      specifiers.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return specifiers
}

function resolveSourceImport(sourceFile, specifier) {
  const clean = specifier.split('?')[0]
  if (clean.startsWith('@/')) return path.join(SRC, clean.slice(2))
  if (clean.startsWith('@core/')) return path.join(CORE_SRC, clean.slice('@core/'.length))
  if (clean.startsWith('@wuwacalc/core/')) return path.join(CORE_SRC, clean.slice('@wuwacalc/core/'.length))
  if (clean.startsWith('.')) return path.resolve(path.dirname(sourceFile), clean)
  return null
}

function isInside(child, parent) {
  const relative = path.relative(parent, child)
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function rootOf(absolute) {
  if (isInside(absolute, SRC)) return 'app'
  if (isInside(absolute, CORE_SRC)) return 'core'
  return null
}

function relativeOf(absolute) {
  return path.relative(ROOT, absolute).split(path.sep).join('/')
}

function layerOf(absolute, root) {
  const base = root === 'core' ? CORE_SRC : SRC
  const first = path.relative(base, absolute).split(path.sep)[0]
  const layers = root === 'core' ? CORE_LAYERS : APP_LAYERS
  return layers.has(first) ? first : null
}

function moduleName(absolute) {
  const parts = path.relative(SRC, absolute).split(path.sep)
  return parts[0] === 'modules' ? parts[1] : null
}

function isPublicModuleEntry(absolute) {
  const relative = path.relative(SRC, absolute).split(path.sep).join('/')
  return relative.includes('/api/') || relative.includes('/pages/')
}

const errors = []

for (const file of [...listFiles(SRC), ...listFiles(CORE_SRC)]) {
  const sourceRoot = rootOf(file)
  if (!sourceRoot) continue
  const sourceLayer = layerOf(file, sourceRoot)
  if (!sourceLayer) continue

  const sourceText = fs.readFileSync(file, 'utf8')
  const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true)

  for (const specifier of importSpecifiers(sourceFile)) {
    if (sourceRoot === 'core' && FORBIDDEN_CORE_PACKAGES.some((pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`))) {
      errors.push(`${relativeOf(file)} -> ${specifier}: core cannot import React or Zustand`)
      continue
    }

    if (sourceRoot === 'app' && specifier.startsWith('@core/')) {
      errors.push(`${relativeOf(file)} -> ${specifier}: app must import the core via @wuwacalc/core`)
      continue
    }

    if (sourceRoot === 'core' && specifier.startsWith('@wuwacalc/core/')) {
      errors.push(`${relativeOf(file)} -> ${specifier}: core must use the internal @core alias`)
      continue
    }

    const target = resolveSourceImport(file, specifier)
    if (!target) continue
    if (sourceRoot === 'app' && specifier.startsWith('.') && !isInside(target, SRC)) {
      errors.push(`${relativeOf(file)} -> ${specifier}: app source cannot import files outside src/`)
      continue
    }
    const targetRoot = rootOf(target)
    if (!targetRoot) continue

    if (sourceRoot === 'core' && targetRoot === 'app') {
      errors.push(`${relativeOf(file)} -> ${specifier}: core cannot import app modules`)
      continue
    }

    if (sourceRoot !== targetRoot) continue

    const targetLayer = layerOf(target, targetRoot)
    if (!targetLayer) continue

    const allowed = sourceRoot === 'core' ? CORE_ALLOWED[sourceLayer] : ALLOWED[sourceLayer]
    if (!allowed.has(targetLayer)) {
      errors.push(`${relativeOf(file)} -> ${specifier}: ${sourceRoot} ${sourceLayer} cannot import ${targetLayer}`)
      continue
    }

    if (sourceLayer === 'engine' && /\/shared\/(?:ui|hooks|navigation)\//.test(relativeOf(target))) {
      errors.push(`${relativeOf(file)} -> ${specifier}: engine cannot import React-facing shared modules`)
      continue
    }

    if (sourceRoot === 'app' && sourceLayer === 'app' && targetLayer === 'modules' && !isPublicModuleEntry(target)) {
      errors.push(`${relativeOf(file)} -> ${specifier}: app must use a module api/ or pages/ entry`)
      continue
    }

    if (sourceRoot === 'app' && sourceLayer === 'modules' && targetLayer === 'modules') {
      const sourceModule = moduleName(file)
      const targetModule = moduleName(target)
      if (sourceModule !== targetModule && !isPublicModuleEntry(target)) {
        errors.push(`${relativeOf(file)} -> ${specifier}: cross-module imports must use api/ or pages/`)
      }
    }
  }
}

if (errors.length) {
  console.error(`Architecture import check failed (${errors.length}):`)
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
} else {
  console.log('Architecture import check passed.')
}