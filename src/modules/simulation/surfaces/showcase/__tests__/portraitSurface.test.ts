/*
  Author: Runor Ewhro
  Description: The surface sampler ignores transparent setup pixels and keeps
               the resulting card tint dark enough for readable text.
*/

import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readdirSync } from 'node:fs'
import surfaces from '@/data/gameData/portraitSurfaces.json'
import { readPortraitSurface, surfaceFromPortraitPixels } from '../portraitSurface.ts'

afterEach(() => vi.unstubAllGlobals())

describe('bundled portrait surfaces', () => {
  it('looks up setup colors without any browser image decoder', async () => {
    vi.stubGlobal('window', { location: { href: 'https://calculator.example/showcase', origin: 'https://calculator.example' } })
    vi.stubGlobal('Image', vi.fn(() => { throw new Error('Must not decode bundled art') }))
    for (const [source, color] of Object.entries(surfaces)) {
      expect(await readPortraitSurface(source)).toBe(color)
    }
    expect(await readPortraitSurface('/assets/game/resonators/spine/setup/luckdraw/new.webp')).toBe('#0c111a')
    expect(Image).not.toHaveBeenCalled()
  })

  it('ships a color for every existing setup asset, including fallback portraits', () => {
    for (const directory of ['spine/setup/luckdraw', 'spine/setup/portrait', 'sprites', 'profiles']) {
      const path = `/assets/game/resonators/${directory}`
      if (!existsSync(`public${path}`)) continue
      const files = readdirSync(`public${path}`, { withFileTypes: true })
      for (const file of files.filter((entry) => entry.isFile() && /\.(webp|png|jpe?g)$/i.test(entry.name))) {
        expect((surfaces as Record<string, string>)[`${path}/${file.name}`]).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })
})

describe('surfaceFromPortraitPixels', () => {
  it('uses visible portrait pixels rather than transparent canvas space', () => {
    const pixels = new Uint8ClampedArray([
      255, 0, 0, 0,
      0, 0, 255, 255,
    ])
    expect(surfaceFromPortraitPixels(pixels)).toBe('#080b6a')
  })

  it('has no color to apply for an empty transparent setup image', () => {
    expect(surfaceFromPortraitPixels(new Uint8ClampedArray([0, 0, 0, 0]))).toBeNull()
  })
})
