/*
  Author: Runor Ewhro
  Description: Packs @wuwacalc/core, installs the tarball into a throwaway
               consumer project, and imports it through the package `exports`
               map to prove the published surface works from node.
*/

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const npmCli = process.env.npm_execpath
  ?? join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
const runNpm = (args, options) => execFileSync(process.execPath, [npmCli, ...args], options)
const pkgDir = dirname(dirname(fileURLToPath(import.meta.url)))
const workDir = mkdtempSync(join(tmpdir(), 'wuwa-core-smoke-'))

const check = `
import assert from 'node:assert/strict'

const core = await import('@wuwacalc/core')
assert.equal(typeof core.configureCore, 'function')
assert.equal(typeof core.initGameData, 'function')
assert.equal(typeof core.pipeline.runResSmlt, 'function')
assert.equal(typeof core.runtimeDefaults.makeResProfile, 'function')
assert.equal(typeof core.optimizerCompiler.compOptPay, 'function')
assert.equal(typeof core.scoring.getWeight, 'function')

const execute = await import('@wuwacalc/core/engine/rotation/execute')
assert.equal(typeof execute.executeRotationProgram, 'function')

const stats = await import('@wuwacalc/core/domain/entities/stats')
assert.equal(typeof stats, 'object')

console.log('package smoke ok:', Object.keys(core).length, 'named exports')
`

try {
  const packOutput = runNpm(['pack', '--json', '--pack-destination', workDir], {
    cwd: pkgDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  const jsonStart = packOutput.search(/\[\s*\{/)
  if (jsonStart < 0) throw new Error(`unexpected npm pack output:\n${packOutput}`)
  const packed = JSON.parse(packOutput.slice(jsonStart))
  const tarball = join(workDir, packed[0].filename)
  console.log('packed', packed[0].filename)

  const consumerDir = join(workDir, 'consumer')
  mkdirSync(consumerDir)
  writeFileSync(join(consumerDir, 'package.json'), JSON.stringify({
    name: 'wuwa-core-smoke',
    private: true,
    type: 'module',
  }, null, 2))
  writeFileSync(join(consumerDir, 'check.mjs'), check)

  runNpm(['install', '--no-audit', '--no-fund', '--ignore-scripts', '--prefer-offline', tarball], {
    cwd: consumerDir,
    stdio: 'inherit',
  })
  execFileSync(process.execPath, ['check.mjs'], { cwd: consumerDir, stdio: 'inherit' })
} finally {
  try {
    rmSync(workDir, { recursive: true, force: true })
  } catch {
    // temp cleanup is best effort on windows file locks
  }
}
