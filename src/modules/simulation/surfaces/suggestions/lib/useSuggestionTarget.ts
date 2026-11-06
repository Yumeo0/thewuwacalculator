/*
  Author: Runor Ewhro
  description: runs the selected rotation program against the active runtime
               and combat context for suggestions.
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
import type { RotationNode } from '@wuwacalc/core/domain/gameData/contracts.ts'
import type { RotationCombatSetup } from '@wuwacalc/core/engine/pipeline/index.ts'

export function useSuggestionTarget(
  liveRuntime: ResRuntime,
  liveSimulation: SimResult | null,
  settings: SuggSets,
  enemy: EnemyProfile,
  participants: Record<string, ResRuntime>,
  selectedTargets: Record<string, string | null>,
  rotationItems?: RotationNode[] | null,
  combatSetup?: RotationCombatSetup,
  ready = true,
) {
  const runtime = useMemo(() => {
    const preset = settings.rotationMode && !rotationItems
      ? getDefaultRotation(liveRuntime.id)
      : null
    const items = rotationItems ?? preset?.items
    if (!settings.rotationMode || !items) return liveRuntime
    return {
      ...liveRuntime,
      rotation: {
        ...liveRuntime.rotation,
        sequence: cloneRotationNodes(items),
        program: cloneRotationNodes(items),
      },
    }
  }, [liveRuntime, settings.rotationMode, rotationItems])

  const simulation = useMemo(() => {
    if (!ready) return null
    if (runtime === liveRuntime) return liveSimulation
    const seed = getResSeedBy(runtime.id)
    return seed ? runResSmlt(runtime, seed, enemy, makeRuntimeMap(runtime, participants), selectedTargets, { combatSetup }) : null
  }, [runtime, liveRuntime, liveSimulation, enemy, participants, selectedTargets, combatSetup, ready])

  return { runtime, simulation }
}
