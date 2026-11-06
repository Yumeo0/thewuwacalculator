/*
  Author: Runor Ewhro
  description: compiles the optimizer payload for single target-skill mode
               by building the target context, encoding inventory echoes,
               and attaching the shared optimizer data needed for execution.
*/

import type { OptStartPay, PrepTargetSkill } from '@core/engine/optimizer/types'
import { makeRuntimeMap } from '@core/engine/runtime/runtimeAdapters'
import { encTgtStatCstrs } from '@core/engine/search/score/statConstraints'
import { mkMainEchoRo, encEchoRows } from '@core/engine/search/encode/echoes'
import { buildSetRows, makeSetMask } from '@core/engine/search/encode/sets'
import { compOptTgtCt } from '@core/engine/search/context/target'
import { mkShrdPay } from '@core/engine/optimizer/compiler/shared'
import { stripEchoes } from '@core/engine/search/context/runtime'

// compile the optimizer for a single selected target skill
// this is the main bridge from editable runtime state into the packed payload
// that later cpu and gpu execution paths consume
export function compTgtRun(input: OptStartPay, baseline = false): PrepTargetSkill {
  // optimizer candidates use inventory echoes with equipped echoes removed.
  const runtime = stripEchoes(input.runtime)

  // rebuild participant runtimes from the stripped runtime so target context
  // generation has the correct team-wide state available
  const participants = makeRuntimeMap(runtime, input.runtimesById)

  // compile the selected skill into the packed target context inputs
  const target = compOptTgtCt({
    runtime,
    resonatorId: input.resonatorId,
    resSeed: input.resSeed,
    skillId: input.settings.targetSkillId!,
    enemy: input.enemyProfile,
    runtimesById: participants,
    selectedTargets: input.selectedTargets,
  })

  // encode stat-floor and stat-cap style optimizer constraints from settings
  const constraints = baseline ? new Float32Array(0) : encTgtStatCstrs(input.settings)

  // encode the inventory echoes using the selected target skill shape
  const encoded = encEchoRows(input.invChs, target.selectedSkill, 'self')

  // build the shared payload used by both target and rotation optimizer modes
  const shared = mkShrdPay(encoded, input, constraints, baseline)

  // current runtime set state for evaluation's set merge
  const setRtMask = makeSetMask(runtime, input.setConds)
  const setConstLut = buildSetRows(runtime, input.setConds)

  // precompute main-echo buff rows for all inventory echoes against this selected skill
  const mainEchoBuffs = mkMainEchoRo({
    echoes: input.invChs,
    runtime,
    sourceBaseStats: target.combat.baseStats,
    sourceFinals: target.combat.finalStats,
    selectedSkill: target.selectedSkill,
  })

  return {
    mode: 'targetSkill',
    ...shared,
    runtime,
    skill: target.skill,
    selectedSkill: target.selectedSkill,
    sourceBaseStats: target.combat.baseStats,
    sourceFinals: target.combat.finalStats,
    compiled: target.compiled,
    setRtMask: setRtMask,
    stats: encoded.stats,
    setConstLut,
    mainEchoBuffs: mainEchoBuffs,
  }
}
