/*
  Author: Runor Ewhro
  Description: Derives the runtime and simulation used by Suggestions for
               a catalog default rotation.
*/

import { useMemo } from 'react'
import type { EnemyProfile } from '@wuwacalc/core/domain/entities/appState.ts'
import type { ResRuntime } from '@wuwacalc/core/domain/entities/runtime.ts'
import type { SuggSets } from '@wuwacalc/core/domain/entities/suggestions.ts'
import { getDefaultRotation } from '@wuwacalc/core/data/catalog/gameDataService.ts'
import { getResSeedBy } from '@wuwacalc/core/data/catalog/resonatorSeedService.ts'
import { runResSmlt } from '@wuwacalc/core/engine/pipeline'
import type { SimResult } from '@wuwacalc/core/engine/pipeline/types.ts'
import { makeRuntimeMap } from '@wuwacalc/core/engine/runtime/runtimeAdapters.ts'
import { cloneRotationNodes } from '@wuwacalc/core/domain/entities/inventoryStorage.ts'

export function useSuggestionTarget(
  liveRuntime: ResRuntime,
  liveSimulation: SimResult | null,
  settings: SuggSets,
  enemy: EnemyProfile,
  participants: Record<string, ResRuntime>,
  selectedTargets: Record<string, string | null>,
) {
  const runtime = useMemo(() => {
    const preset = settings.rotationMode
      ? getDefaultRotation(liveRuntime.id)
      : null
    if (!preset) return liveRuntime
    return {
      ...liveRuntime,
      rotation: {
        ...liveRuntime.rotation,
        sequence: cloneRotationNodes(preset.items),
        program: cloneRotationNodes(preset.items),
      },
    }
  }, [liveRuntime, settings.rotationMode])

  const simulation = useMemo(() => {
    if (runtime === liveRuntime) return liveSimulation
    const seed = getResSeedBy(runtime.id)
    return seed ? runResSmlt(runtime, seed, enemy, makeRuntimeMap(runtime, participants), selectedTargets) : null
  }, [runtime, liveRuntime, liveSimulation, enemy, participants, selectedTargets])

  return { runtime, simulation }
}
