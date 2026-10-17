/*
  Author: Runor Ewhro
  description: defines synthetic formula-stat paths used by rotation condition
               nodes to alter later feature formulas without touching saved
               manual buffs or scoped source effects.
*/

export const ROT_FORMULA_PATH_PREFIX = 'runtime.rotation.formula.'

export type RotFormulaStatKey =
  | 'atkFlat'
  | 'atkPercent'
  | 'hpFlat'
  | 'hpPercent'
  | 'defFlat'
  | 'defPercent'
  | 'energyRegen'
  | 'critRate'
  | 'critDmg'
  | 'healingBonus'
  | 'shieldBonus'
  | 'resIgnore'
  | 'defIgnore'
  | 'dmgBonus'
  | 'dmgAmp'
  | 'dmgVuln'
  | 'tuneBreakBoost'
  | 'finalDmg'
  | 'flatDmg'
  | 'mvAdd'
  | 'mvScale'
  | 'offTuneAdd'
  | 'fixedDmg'
  | 'fixedMv'

export type RotFormulaStats = Partial<Record<RotFormulaStatKey, number>>

/** ordered formula stat keys; the list index is the runtime slot the compiler uses. */
export const ROT_FORMULA_STAT_KEYS: RotFormulaStatKey[] = [
  'atkFlat',
  'atkPercent',
  'hpFlat',
  'hpPercent',
  'defFlat',
  'defPercent',
  'energyRegen',
  'critRate',
  'critDmg',
  'healingBonus',
  'shieldBonus',
  'resIgnore',
  'defIgnore',
  'dmgBonus',
  'dmgAmp',
  'dmgVuln',
  'tuneBreakBoost',
  'finalDmg',
  'flatDmg',
  'mvAdd',
  'mvScale',
  'offTuneAdd',
  'fixedDmg',
  'fixedMv',
]

const ROT_FORMULA_STAT_KEY_SET = new Set<RotFormulaStatKey>(ROT_FORMULA_STAT_KEYS)
const LEGACY_ROT_FORMULA_STAT_KEYS: Record<string, RotFormulaStatKey> = {
  special: 'finalDmg',
}

export function getRotFormulaStatKey(path: string): RotFormulaStatKey | null {
  const normalized = path.startsWith('runtime.') ? path : `runtime.${path}`
  if (!normalized.startsWith(ROT_FORMULA_PATH_PREFIX)) {
    return null
  }

  const storedKey = normalized.slice(ROT_FORMULA_PATH_PREFIX.length)
  const key = LEGACY_ROT_FORMULA_STAT_KEYS[storedKey] ?? storedKey
  return ROT_FORMULA_STAT_KEY_SET.has(key as RotFormulaStatKey) ? key as RotFormulaStatKey : null
}

export function getRotFormulaPath(key: RotFormulaStatKey): string {
  return `${ROT_FORMULA_PATH_PREFIX}${key}`
}
