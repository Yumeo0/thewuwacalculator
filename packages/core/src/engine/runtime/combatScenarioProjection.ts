/*
  Author: Runor Ewhro
  Description: Converts the retired active-profile persistence contract into
               a canonical combat scenario for imports and schema migration.
*/

import type { LegacyProfileMap } from '@core/domain/entities/appState'
import type { CombatScenario } from '@core/domain/entities/combatScenario'
import type { CombatSession } from '@core/domain/entities/session'
import { makeScenarioFromProfiles } from '@core/engine/runtime/defaults'

export interface LegacyCombatScenarioSource {
  profiles: LegacyProfileMap
  runtimeRevision: number
  session: CombatSession
}

/** Migration-only projection; live code reads the persisted scenario directly. */
export function projectCombatScenario(
  source: LegacyCombatScenarioSource,
): CombatScenario {
  return makeScenarioFromProfiles(
    source.profiles,
    source.session,
    source.runtimeRevision,
  )
}
