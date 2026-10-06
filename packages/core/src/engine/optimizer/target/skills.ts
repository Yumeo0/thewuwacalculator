/*
  Author: Runor Ewhro
  Description: lists valid direct optimizer targets from a runtime and prepares
               a specific target skill only when it remains eligible for direct
               optimizer evaluation.
*/

import type { ResRuntime } from '@core/domain/entities/runtime'
import type { CombatContext } from '@core/engine/pipeline/types'
import type { SkillDef } from '@core/domain/entities/stats'
import { listRtSkills } from '@core/engine/services/runtimeSourceService'
import { resolveSkill } from '@core/engine/pipeline/resolveSkill'
import { prepareSkill } from '@core/engine/pipeline/prepareRuntimeSkill'
import { isOptDmgSkll } from '@core/engine/optimizer/rules/eligibility'

// local helper that defines which prepared skills can be selected
// as direct optimizer targets
function isDrctTgt(skill: SkillDef): boolean {
  return isOptDmgSkll(skill)
}

// enumerate all runtime-visible skills, fully resolve each one against the
// current runtime state, then keep only those that qualify as optimizer targets
export function listOptTrgt(runtime: ResRuntime): SkillDef[] {
  return listRtSkills(runtime)
      .map((skill) => resolveSkill(runtime, skill))
      .filter(isDrctTgt)
}

// prepare one specific skill id inside a known combat context and return it
// only if the prepared skill still exists and is optimizer-eligible
export function prprOptTgt(
    runtime: ResRuntime,
    skillId: string,
    combat: CombatContext,
): SkillDef | null {
  const prepared = prepareSkill(runtime, skillId, combat)

  if (!prepared || !isDrctTgt(prepared)) {
    return null
  }

  return prepared
}
