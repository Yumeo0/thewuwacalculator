/*
  Author: Runor Ewhro
  description: shared display metadata for attribute-facing ui accents.
*/

import { getResSeedBy } from '@wuwacalc/core/data/catalog/resonatorSeedService'
import type { AttributeKey } from '@wuwacalc/core/domain/entities/stats'

export const ATTR_COLORS: Record<AttributeKey, string> = {
  aero: '#51ffb3',
  glacio: '#40aefa',
  spectro: '#f8e56c',
  fusion: '#f0734d',
  electro: '#b46aff',
  havoc: '#e649a6',
  physical: '#8c8c8c',
}

export function getAttributeIconSrc(attribute: string | null | undefined): string | null {
  return attribute ? `/assets/game/attributes/icons/${attribute}.webp` : null
}

/** accent color for an attribute key, when the key names an element. */
export function attributeAccent(attribute: string | null | undefined): string | undefined {
  return attribute ? ATTR_COLORS[attribute as AttributeKey] : undefined
}

// returns the accent color for a resonator, or null if none is defined
export function getResAccent(resonatorId: string): string | null {
  const seed = getResSeedBy(resonatorId)
  if (seed) return ATTR_COLORS[seed.attribute] ?? null
  return null
}
