/*
  Author: Runor Ewhro
  Description: derives a resonator's "build" stats: base stats, equipped gear,
               and every effect whose activation is fixed by that concrete
               build. Toggleable combat state, stacks, active targeting, manual
               inputs, and enemy state remain excluded. Not evaluation-specific.
*/

import type { ResRuntime } from '@core/domain/entities/runtime'
import type { EffectContext, EffectDef } from '@core/domain/gameData/contracts'
import type { FinalStats, ResBaseStats } from '@core/domain/entities/stats'
import { isBuildBoundEffect } from '@core/domain/gameData/effectActivation'
import { getGameData } from '@core/data/gameData/index'
import { evalCond } from '@core/engine/effects/evaluator'
import { calcFinalStats } from '@core/engine/formulas/finalStats'
import { applyRtDataF } from '@core/engine/effects/dataEffects'
import { mkRtBaseBuff } from '@core/engine/pipeline/buildCombatContext'
import { makeCombatState, makeCustomBuff, makeEnemy } from '@core/engine/runtime/defaults'
import { wpnAtkAt } from '@core/engine/runtime/weaponState'

// Clear toggleable inputs as a second line of defense. The effect classifier
// keeps control-driven effects out entirely; neutral state also prevents an
// accidentally admitted condition from inheriting the live combat setup.
function neutralizeRuntime(runtime: ResRuntime): ResRuntime {
  return {
    ...runtime,
    state: {
      ...runtime.state,
      controls: {},
      manualBuffs: makeCustomBuff(),
      combat: makeCombatState(),
    },
  }
}

function includeBuildEffect(effect: EffectDef, context: EffectContext): boolean {
  const owner = effect.ownerKey ? getGameData().ownersByKey[effect.ownerKey] : undefined
  if (!isBuildBoundEffect(effect, owner)) return false

  const scope = {
    sourceRuntime: context.sourceRuntime,
    sourceFinalStats: context.sourceFinalStats,
    targetRuntime: context.targetRuntime,
    activeRuntime: context.activeRuntime,
    context,
    pool: context.pool,
    baseStats: context.baseStats,
    finalStats: context.finalStats,
  }
  return evalCond(owner?.unlockWhen, scope) && evalCond(owner?.visibleWhen, scope)
}

export function getBuildStats(runtime: ResRuntime, baseStats: ResBaseStats): FinalStats {
  const neutral = neutralizeRuntime(runtime)
  const weaponAttack = wpnAtkAt(runtime.build.weapon.id, runtime.build.weapon.level)
  const pool = mkRtBaseBuff(neutral)
  const options = {
    teamRuntime: neutral,
    actResId: neutral.id,
    baseStats,
    enemy: makeEnemy(),
    includeEchoSets: true,
  }

  const preStatsPool = applyRtDataF(
    neutral,
    pool,
    options,
    'preStats',
    undefined,
    includeBuildEffect,
  )
  const preStats = calcFinalStats(baseStats, preStatsPool, weaponAttack)
  const postStatsPool = applyRtDataF(
    neutral,
    preStatsPool,
    { ...options, finalStats: preStats },
    'postStats',
    undefined,
    includeBuildEffect,
  )
  const postStats = calcFinalStats(baseStats, postStatsPool, weaponAttack)
  const finalStatsPool = applyRtDataF(
    neutral,
    postStatsPool,
    { ...options, finalStats: postStats },
    'finalStats',
    undefined,
    includeBuildEffect,
  )

  return calcFinalStats(baseStats, finalStatsPool, weaponAttack)
}
