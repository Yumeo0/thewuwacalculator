/*
  Author: Runor Ewhro
  description: converts the retired active-profile persistence contract into
               a canonical combat scenario for imports and schema migration.
*/

import type { LegacyProfileMap } from '@wuwacalc/core/domain/entities/appState'
import type { CombatScenario } from '@wuwacalc/core/domain/entities/combatScenario'
import type { CombatSession } from '@wuwacalc/core/domain/entities/session'
import { makeScenarioFromProfiles } from '@wuwacalc/core/engine/runtime/defaults'

export interface LegacyCombatScenarioSource {
  profiles: LegacyProfileMap
  runtimeRevision: number
  session: CombatSession
}

/** migration-only projection; live code reads the persisted scenario directly. */
export function projectCombatScenario(
  source: LegacyCombatScenarioSource,
): CombatScenario {
  return makeScenarioFromProfiles(
    source.profiles,
    source.session,
    source.runtimeRevision,
  )
}
