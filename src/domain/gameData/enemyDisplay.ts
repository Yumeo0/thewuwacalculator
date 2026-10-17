/*
  Author: Runor Ewhro
  description: display metadata for enemy-facing ui: element and class labels
               plus catalog icon paths.
*/

import type { EnemyClassId, EnemyElemId } from '@wuwacalc/core/domain/entities/enemy'

export const ENEMY_ELEM_TXT: Record<EnemyElemId, string> = {
  0: 'Physical',
  1: 'Glacio',
  2: 'Fusion',
  3: 'Electro',
  4: 'Aero',
  5: 'Spectro',
  6: 'Havoc',
}

// display labels for enemy classes
export const ENEMY_CLASS_TXT: Record<EnemyClassId, string> = {
  1: 'Common',
  2: 'Elite',
  3: 'Overlord',
  4: 'Calamity',
}

// resolve an enemy icon path from a numeric enemy id
export function getEnemyIcon(enemyId: string | null | undefined): string | null {
  if (!enemyId) {
    return null
  }

  return /^\d+$/.test(enemyId) ? `/assets/game/enemies/icons/${enemyId}.webp` : null
}
