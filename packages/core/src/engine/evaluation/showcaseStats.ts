/*
  Author: Runor Ewhro
  Description: Computes the current combat sheet without rotation execution or scoring.
*/
import { getResSeedBy } from '@core/data/catalog/resonatorSeedService'
import { makeCombatGraph } from '@core/engine/runtime/combatGraph'
import { makeRuntimeMap } from '@core/engine/runtime/runtimeAdapters'
import { makeCombatEnv } from '@core/engine/pipeline/buildCombatContext'
import type { ShowcaseContext } from './showcaseAnalysis'

export function computeShowcaseStats(input: ShowcaseContext) {
  const seed = getResSeedBy(input.runtime.id)
  if (!seed) return null
  const graph = makeCombatGraph({
    actRt: input.runtime,
    activeSeed: seed,
    partRts: makeRuntimeMap(input.runtime, input.runtimesById),
    targetsByRes: { [input.runtime.id]: input.selectedTargets },
    ...input.graph,
  })
  return makeCombatEnv({ graph, targetSlotId: graph.activeSlotId, enemy: input.enemy }).finalStats
}
