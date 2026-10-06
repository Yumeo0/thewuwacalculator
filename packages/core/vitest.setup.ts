/*
  Author: Runor Ewhro
  Description: Prepares vitest fetch handling and hydrates core game data for
               standalone core test runs (repository checkout, no app build).
*/

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { vi } from 'vitest'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function resReqUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input
  }

  if (input instanceof URL) {
    return input.toString()
  }

  return input.url
}

const origFetch = globalThis.fetch

vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = resReqUrl(input)

  if (url.startsWith('/data/')) {
    const filePath = path.join(repoRoot, 'public', url.slice(1))
    const text = await readFile(filePath, 'utf8')

    return {
      ok: true,
      status: 200,
      text: async () => text,
      json: async () => JSON.parse(text),
    } as Response
  }

  if (origFetch) {
    return origFetch(input as RequestInfo, init)
  }

  throw new Error(`Unhandled test fetch request: ${url}`)
})

const { initGameData } = await import('@core/data/gameData')
await initGameData()
