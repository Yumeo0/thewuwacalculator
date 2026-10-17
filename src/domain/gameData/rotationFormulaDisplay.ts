/*
  Author: Runor Ewhro
  description: display labels and descriptions for rotation formula stat keys.
*/

import type { RotFormulaStatKey } from '@wuwacalc/core/domain/gameData/rotationFormulaStats'

export const ROT_FORMULA_STAT_LABELS: Record<RotFormulaStatKey, { label: string; description: string }> = {
  atkFlat: { label: 'Flat ATK', description: 'Adds flat ATK to later feature formulas that scale with ATK.' },
  atkPercent: { label: 'ATK%', description: 'Adds ATK% to later feature formulas that scale with ATK.' },
  hpFlat: { label: 'Flat HP', description: 'Adds flat HP to later feature formulas that scale with HP.' },
  hpPercent: { label: 'HP%', description: 'Adds HP% to later feature formulas that scale with HP.' },
  defFlat: { label: 'Flat DEF', description: 'Adds flat DEF to later feature formulas that scale with DEF.' },
  defPercent: { label: 'DEF%', description: 'Adds DEF% to later feature formulas that scale with DEF.' },
  energyRegen: { label: 'Energy Regen', description: 'Adds Energy Regen to later feature formulas that scale with Energy Regen.' },
  critRate: { label: 'Crit Rate', description: 'Adds Crit Rate to later feature formulas that can crit.' },
  critDmg: { label: 'Crit DMG', description: 'Adds Crit DMG to later feature formulas that can crit.' },
  healingBonus: { label: 'Healing Bonus', description: 'Adds Healing Bonus to later healing formulas.' },
  shieldBonus: { label: 'Shield Bonus', description: 'Adds Shield Bonus to later shield formulas.' },
  resIgnore: { label: 'RES Ignore', description: 'Adds resistance ignore to later damage formulas.' },
  defIgnore: { label: 'DEF Ignore', description: 'Adds defense ignore to later damage formulas.' },
  dmgBonus: { label: 'DMG Bonus', description: 'Adds DMG Bonus to later damage formulas.' },
  dmgAmp: { label: 'DMG Amplify', description: 'Adds DMG Amplify to later damage formulas.' },
  dmgVuln: { label: 'DMG Vulnerability', description: 'Adds DMG Vulnerability to later damage formulas.' },
  tuneBreakBoost: { label: 'Tune Break Boost', description: 'Adds Tune Break Boost to later tune, hack, or tune-related formulas.' },
  finalDmg: { label: 'Final DMG', description: 'Adds Final DMG to later formulas that use the final damage multiplier.' },
  flatDmg: { label: 'Flat DMG', description: 'Adds Flat DMG to later direct damage formulas.' },
  mvAdd: { label: 'MV Add', description: 'Adds to the MV of later feature formulas where an MV exists.' },
  mvScale: { label: 'MV Scale', description: 'Scales the MV of later feature formulas where an MV exists.' },
  offTuneAdd: { label: 'Off-Tune Add', description: 'Adds directly to the Off-Tune applied by later skill or hit formulas.' },
  fixedDmg: { label: 'Fixed DMG', description: 'Adds Fixed DMG to later direct damage formulas.' },
  fixedMv: { label: 'Fixed MV', description: 'Adds Fixed MV to later negative-effect formulas that use a fixed MV.' },
}
