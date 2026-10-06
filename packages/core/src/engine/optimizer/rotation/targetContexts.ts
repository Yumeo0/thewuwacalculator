/*
  Author: Runor Ewhro
  Description: Builds packed per-target rotation contexts and display context for optimizer execution.
*/

import { optimizerFloats } from '@core/engine/optimizer/workers/payloadBuffers'
/*
  Shared owner-context resolution and numeric packing for any evaluator that
  scores a materialized rotation as weighted skill targets.
*/

import type { EnemyProfile } from '@core/domain/entities/appState'
import type { CombatGraph } from '@core/domain/entities/combatGraph'
import type { SkillDef } from '@core/domain/entities/stats'
import type { FinalStats } from '@core/domain/entities/stats'
import type { ResRuntime } from '@core/domain/entities/runtime'
import type { DamageCombatState } from '@core/engine/formulas/damage'
import { findCombatPart } from '@core/engine/runtime/combatGraph'
import { CTX_FLOATS } from '@core/engine/optimizer/config/constants'
import { makeOptContext } from '@core/engine/optimizer/context/compiled'
import { packTargetCtx } from '@core/engine/optimizer/context/pack'
import { MV } from '@core/engine/optimizer/config/constants'
import { makeCombatEnv } from '@core/engine/pipeline/buildCombatContext'

export type RotationCombatContext = ReturnType<typeof makeCombatEnv>

export interface RotationTargetContext {
  resonatorId: string
  skill: SkillDef
  weight?: number
  runtime?: ResRuntime
  finalStats?: FinalStats
  combat?: DamageCombatState
  nodeMultiplier?: number
}

export interface RotationContextShape {
  comboN: number
  comboK: number
  comboCount: number
  setRtMask: number
}

export interface PackedRotationTargetContexts<T extends RotationTargetContext> {
  targets: T[]
  contexts: Float32Array
  contextWeight: Float32Array
  displayContext: Float32Array | null
}

export function buildRotationCombatContexts(
    graph: CombatGraph,
    activeContext: RotationCombatContext,
    activeId: string,
    targets: readonly RotationTargetContext[],
    enemy: EnemyProfile,
): Record<string, RotationCombatContext> {
  const contexts: Record<string, RotationCombatContext> = { [activeId]: activeContext }

  for (const target of targets) {
    if (target.runtime && target.finalStats) {
      continue
    }
    if (contexts[target.resonatorId]) {
      continue
    }

    const slotId = findCombatPart(graph, target.resonatorId)
    if (!slotId) {
      continue
    }

    contexts[target.resonatorId] = makeCombatEnv({ graph, targetSlotId: slotId, enemy })
  }

  return contexts
}

export function packRotationTargetContexts<T extends RotationTargetContext>(options: {
  targets: readonly T[]
  combatByResonatorId: Record<string, RotationCombatContext>
  activeContext: RotationCombatContext
  enemy: EnemyProfile
  shape: RotationContextShape
  prepareSkill?: (target: T, ownerContext: RotationCombatContext) => SkillDef
}): PackedRotationTargetContexts<T> {
  const {
    targets: sourceTargets,
    combatByResonatorId,
    activeContext,
    enemy,
    shape,
    prepareSkill,
  } = options
  const targets: T[] = []
  const contexts = optimizerFloats(sourceTargets.length * CTX_FLOATS)
  const contextWeight = optimizerFloats(sourceTargets.length)
  let displayContext: Float32Array | null = null
  let lowestPositive = Number.POSITIVE_INFINITY
  let lowestCrit = Number.POSITIVE_INFINITY
  let lowestZero = Number.POSITIVE_INFINITY

  for (let index = 0; index < sourceTargets.length; index += 1) {
    const sourceTarget = sourceTargets[index]
    const ownerContext = combatByResonatorId[sourceTarget.resonatorId] ?? activeContext
    const skill = prepareSkill?.(sourceTarget, ownerContext) ?? sourceTarget.skill
    const target = skill === sourceTarget.skill
      ? sourceTarget
      : { ...sourceTarget, skill }
    const compiled = makeOptContext({
      resonatorId: target.resonatorId,
      runtime: target.runtime ?? ownerContext.runtime,
      skill,
      finalStats: target.finalStats ?? ownerContext.finalStats,
      enemy,
      combatState: target.combat ?? ownerContext.runtime.state.combat,
    })
    const packed = packTargetCtx({
      compiled,
      skill,
      runtime: ownerContext.runtime,
      comboN: shape.comboN,
      comboK: shape.comboK,
      comboCount: shape.comboCount,
      comboBaseIndex: 0,
      lockEchoIdx: -1,
      setRtMask: shape.setRtMask,
    })
    const weight = target.weight ?? 1
    packed[MV] = (packed[MV] ?? 0) * (target.nodeMultiplier ?? 1)

    targets.push(target as T)
    contexts.set(packed, index * CTX_FLOATS)
    contextWeight[index] = weight

    if (skill.archetype !== 'skillDamage') {
      continue
    }

    const critSum = compiled.statCritRate + compiled.statCritDmg
    const displayValue = Number.isFinite(weight) ? weight : 1
    if (
      displayValue > 0
      && (displayValue < lowestPositive || (displayValue === lowestPositive && critSum < lowestCrit))
    ) {
      lowestPositive = displayValue
      lowestCrit = critSum
      displayContext = optimizerFloats(packed)
      continue
    }

    if (lowestPositive === Number.POSITIVE_INFINITY && displayValue === 0 && critSum < lowestZero) {
      lowestZero = critSum
      displayContext = optimizerFloats(packed)
    }
  }

  return { targets, contexts, contextWeight, displayContext }
}
