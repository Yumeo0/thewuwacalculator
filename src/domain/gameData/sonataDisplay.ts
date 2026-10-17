/*
  Author: Runor Ewhro
  description: display metadata for sonata set icons and ring colors.
*/

import { getSntSetById } from '@wuwacalc/core/data/gameData/catalog/sonataSets'

// get the icon path for a sonata set id
export function getSntSetIco(id: number): string | null {
  return getSntSetById(id)?.icon ?? null
}

// get the ring color sampled from the sonata set icon
export function getSntSetClr(id: number): string | null {
  return getSntSetById(id)?.color ?? null
}
