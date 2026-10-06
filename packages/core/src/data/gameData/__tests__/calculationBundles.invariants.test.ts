/*
  Author: Runor Ewhro
  Description: Verifies calculation-only bundles reproduce full-catalog combat
               results for every resonator in beta and live data modes.
*/

import { expect, it } from 'vitest'
import { initGameData } from '@core/data/gameData'
import { listResSds, getResSeedBy } from '@core/data/catalog/resonatorSeedService'
import { makeEnemy, makeResRuntime } from '@core/engine/runtime/defaults'
import { maxResRt } from '@core/engine/gameData/resonatorMax'
import { runResSmlt } from '@core/engine/pipeline'
import { makeRuntimeMap } from '@core/engine/runtime/runtimeAdapters'
import { getResDtlsBy } from '@core/data/gameData/resonators/resonatorDataStore'

it('keeps every resonator calculation identical with stripped worker details and scoped weapons', async () => {
  try {
    for (const mode of ['beta', 'live'] as const) {
      await initGameData({ mode })
      const enemy = makeEnemy()
      const fixtures = listResSds().map((seed) => {
        const runtime = maxResRt(makeResRuntime(seed), getResDtlsBy()[seed.id], { targetSequence: 6 })
        return { id: seed.id, runtime, expected: runResSmlt(runtime, seed, enemy, makeRuntimeMap(runtime, {}), {}) }
      })
      await initGameData({
        mode,
        resonatorIds: fixtures.map((fixture) => fixture.id),
        calculationOnly: true,
        weaponIds: fixtures.flatMap(({ runtime }) => runtime.build.weapon.id ? [runtime.build.weapon.id] : []),
      })
      for (const { id, runtime, expected } of fixtures) {
        const seed = getResSeedBy(id)!
        expect(runResSmlt(runtime, seed, enemy, makeRuntimeMap(runtime, {}), {}), `${mode}:${id}`).toEqual(expected)
      }
    }
  } finally {
    await initGameData()
  }
}, 60000)
