/*
  Author: Runor Ewhro
  description: defines the persisted calculation state contracts shared by the
               calculator core: scenarios, saved artifacts, and optimizer state.
*/

import type { ResProf } from './profile'
import type { SavedArtifactLibrary } from './inventoryStorage'
import type { OptSets } from './optimizer'
import type { SuggestState, WeaponPlanSet } from './suggestions'
import type { AttributeKey } from './stats'
import type { ScenarioWorkspace } from './scenarioLibrary'
import type { ResonatorId } from './runtime'

// shared unset enemy id
export const NONE_ENEMY_ID = '0'

export type EnemyResistN = 0 | 1 | 2 | 3 | 4 | 5 | 6
export type EnemyResistT = Record<EnemyResistN, number>

// map elemental attributes to enemy resistance slots
export const ATTR_ENEMY_RES: Record<AttributeKey, EnemyResistN> = {
  physical: 0,
  glacio: 1,
  fusion: 2,
  electro: 3,
  aero: 4,
  spectro: 5,
  havoc: 6,
}

export interface EnemyProfile {
  id: string
  level: number
  class: number
  toa: boolean
  res: EnemyResistT
  source?: 'catalog' | 'custom'
  status?: EnemyStatus
}

// enemy combat-state values set in the enemy pane. tuneStrain is always present; additional
// keys are per-enemy debuff states (toggles/stacks/selects) declared by enemy source data and
// read by effects via the `enemy.status.<field>` path.
export type EnemyStateValue = number | boolean | string

export interface EnemyStatus {
  tuneStrain: number
  [field: string]: EnemyStateValue
}

// check whether the enemy profile is the unset placeholder
export function isNoEnemy(enemy: Pick<EnemyProfile, 'id'>): boolean {
  return enemy.id === NONE_ENEMY_ID
}


export interface SimulationState {
  /** resonator whose derived build choices the current optimizer settings belong to. */
  optimizerSettingsResonatorId: ResonatorId | null
  optimizerSettings: OptSets
  weaponSuggests: WeaponPlanSet
  suggestionsByResonatorId: Record<string, SuggestState>
}

export type LegacyProfileMap = Record<string, ResProf>

export interface PersistedState {
  version: 28
  /** canonical live combat state, independent of simulation tooling. */
  combat: ScenarioWorkspace
  /** user-authored snapshots, independent from any simulation surface. */
  library: SavedArtifactLibrary
  simulation: SimulationState
}

export type HydratedAppState = PersistedState
