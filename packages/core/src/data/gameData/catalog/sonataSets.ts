/*
  Author: Runor Ewhro
  description: cached sonata set metadata loaded from json during
               simulation bootstrap.
*/

export interface SntSetDef {
  id: number
  name: string
  icon: string
  color?: string
}

export let SONATA_SETS: SntSetDef[] = []

let sntSetsById: Record<number, SntSetDef> = {}

export function initSntSets(sets: SntSetDef[]): void {
  SONATA_SETS = sets
  sntSetsById = Object.fromEntries(
      sets.map((set) => [set.id, set]),
  ) as Record<number, SntSetDef>
}

// get the display name for a sonata set id
export function getSntSetNam(id: number): string {
  return sntSetsById[id]?.name ?? `Set ${id}`
}

/** the catalog definition for a sonata set id, if it is known. */
export function getSntSetById(id: number): SntSetDef | undefined {
  return sntSetsById[id]
}
