import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

type PackageManifest = {
  dependencies?: Record<string, string>
  packages?: Record<string, {
    dependencies?: Record<string, string>
    version?: string
  }>
}

function readJson(path: string): PackageManifest {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as PackageManifest
}

describe('Spine runtime dependency contract', () => {
  it('pins matching core and WebGL runtimes in the manifest and lockfile', () => {
    const manifest = readJson('package.json')
    const lockfile = readJson('package-lock.json')
    const coreVersion = manifest.dependencies?.['@esotericsoftware/spine-core']
    const webglVersion = manifest.dependencies?.['@esotericsoftware/spine-webgl']

    expect(coreVersion).toMatch(/^\d+\.\d+\.\d+$/)
    expect(webglVersion).toBe(coreVersion)
    expect(lockfile.packages?.['']?.dependencies?.['@esotericsoftware/spine-core']).toBe(coreVersion)
    expect(lockfile.packages?.['node_modules/@esotericsoftware/spine-core']?.version).toBe(coreVersion)
    expect(lockfile.packages?.['node_modules/@esotericsoftware/spine-webgl']?.version).toBe(webglVersion)
  })
})
