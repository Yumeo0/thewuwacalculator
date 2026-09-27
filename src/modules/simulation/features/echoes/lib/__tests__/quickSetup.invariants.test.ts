/*
  Author: Runor Ewhro
  Description: Verifies dual-set main Echoes remain legal leaders for Forge beta
               five-piece quick-build plans.
*/

import { describe, expect, it } from 'vitest'
import { getEchoById } from '@/data/catalog/echoCatalogService'
import { cmptSetCnts } from '../echoPane'
import { canMainEchoFitSetPlan, generateQuickBuild, makeQuickConfig } from '../quickSetup'

describe('Forge beta Sonata plans', () => {
  it.each([
    [36, '6000225'],
    [37, '6000225'],
    [38, '6000218'],
  ] as const)('keeps the dual-set 4-cost lead Echo in a five-piece set %i build', (setId, mainEchoId) => {
    const setPreferences = [{ setId, count: 5 }]
    expect(canMainEchoFitSetPlan(mainEchoId, setPreferences, [4, 3, 3, 1, 1])).toBe(true)

    const echoes = generateQuickBuild({ ...makeQuickConfig(), mainEchoId, setPreferences })
    expect(echoes[0]?.id).toBe(mainEchoId)
    expect(echoes[0]?.set).toBe(setId)
    expect(echoes.map((echo) => echo && getEchoById(echo.id)?.cost)).toEqual([4, 3, 3, 1, 1])
    expect(cmptSetCnts(echoes)[setId]).toBe(5)
    for (const echo of echoes) {
      expect(echo?.set).toBe(setId)
      expect(echo && getEchoById(echo.id)?.sets).toContain(setId)
    }
  })
})
