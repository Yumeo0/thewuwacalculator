// Bundle the app's TypeScript dependencies for the offline translation tool.
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const temporary = await mkdtemp(join(tmpdir(), 'rotation-translation-'))
try {
  const outfile = join(temporary, 'tool.mjs')
  await build({ entryPoints: ['tools/analysis/rotationTranslation.ts'], outfile, bundle: true,
    platform: 'node', format: 'esm', tsconfig: 'tsconfig.app.json',
    define: { 'import.meta.env': JSON.stringify({ DEV: false, MODE: 'production', BASE_URL: '/' }) } })
  await import(pathToFileURL(outfile).href)
} finally {
  await rm(temporary, { recursive: true, force: true })
}
