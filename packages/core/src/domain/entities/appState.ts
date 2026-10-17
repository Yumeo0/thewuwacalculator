/*
  Author: Runor Ewhro
  description: defines the persisted calculation state contracts shared by the
               calculator core: scenarios, saved artifacts, and optimizer state.
*/

import type { ResProf } from './profile'
import type { AttributeKey } from './stats'

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

export type LegacyProfileMap = Record<string, ResProf>
