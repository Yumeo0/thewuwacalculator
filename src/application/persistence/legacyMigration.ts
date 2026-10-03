/*
  Author: Runor Ewhro
  Description: Recovers monolithic and versioned legacy application state
               without treating newly introduced defaults as stored values.
*/

import type { HydratedAppState, PersistedState } from '@/domain/entities/appState'
import { makeAppState, initAppState } from '@/engine/runtime/defaults'
import { persistedSchema } from '@/engine/runtime/schema'
import { APP_STORAGE_KEY } from './storageKeys'

const LEGACY_STORAGE_VERSIONS = [26, 25, 24, 23, 22] as const

interface LegacyMigrationDeps {
  parsePersisted: (raw: string) => HydratedAppState
  saveAppState: (state: PersistedState) => void
  quarantine: (key: string, raw: string) => void
}

export function readMonolithicState({ parsePersisted, saveAppState, quarantine }: LegacyMigrationDeps): HydratedAppState | null {
  const raw = localStorage.getItem(APP_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    const snapshot = parsePersisted(raw)
    saveAppState(snapshot)
    localStorage.removeItem(APP_STORAGE_KEY)
    return snapshot
  } catch (error) {
    console.warn('[storage] failed to migrate monolithic app snapshot', error)
    try {
      quarantine(APP_STORAGE_KEY, raw)
    } catch (rcvrRrr) {
      console.warn('[storage] failed to quarantine invalid monolithic app snapshot', rcvrRrr)
    }
    return null
  }
}

function readLegacyStateVersion(
  version: typeof LEGACY_STORAGE_VERSIONS[number],
  { parsePersisted, saveAppState }: LegacyMigrationDeps,
): HydratedAppState | null {
  const legacyStorageKey = `wwcalc.app.v${version}`
  const monolith = localStorage.getItem(legacyStorageKey)
  if (monolith) {
    try {
      const snapshot = parsePersisted(monolith)
      saveAppState(snapshot)
      localStorage.removeItem(legacyStorageKey)
      return snapshot
    } catch (error) {
      console.warn(`[storage] failed to migrate v${version} app snapshot`, error)
    }
  }

  const legacySuffixes = [
    'ui.appearance',
    'ui.layout',
    'ui.saved-rotation-preferences',
    'session',
    ...(version === 26 || version === 25 || version === 24
      ? ['combat.workspace']
      : version === 23
        ? ['workspace']
        : []),
    'profiles',
    'optimizer-context',
    'suggestions',
    'inventory.echoes',
    'inventory.builds',
    'inventory.rotations',
    ...(version === 26 ? ['inventory.scenarios'] : []),
  ]
  const defaults = makeAppState()
  const draft = structuredClone(defaults) as unknown as Record<string, unknown>
  const draftUi = draft.ui as Record<string, unknown>
  const draftCalculator = draft.simulation as Record<string, unknown>
  // Let the legacy optimizer-context slice supply its settings. Leaving the
  // v27 default here would make migration mistake it for explicitly stored data.
  delete draftCalculator.optimizerSettings
  delete draft.combat
  delete draft.library
  draft.version = version
  let found = false

  for (const suffix of legacySuffixes) {
    const raw = localStorage.getItem(`${legacyStorageKey}.${suffix}`)
    if (!raw) continue
    try {
      const slice = JSON.parse(raw) as {
        ui?: Record<string, unknown>
        combat?: Record<string, unknown>
        calculator?: Record<string, unknown>
        simulation?: Record<string, unknown>
        library?: Record<string, unknown>
      }
      if (slice.ui) Object.assign(draftUi, slice.ui)
      if (slice.combat) draft.combat = slice.combat
      if (slice.simulation ?? slice.calculator) {
        Object.assign(draftCalculator, slice.simulation ?? slice.calculator)
      }
      if (slice.library) {
        const draftLibrary = draft.library && typeof draft.library === 'object'
          ? draft.library as Record<string, unknown>
          : { echoes: [], builds: [], rotations: [], scenarios: [] }
        Object.assign(draftLibrary, slice.library)
        draft.library = draftLibrary
      }
      found = true
    } catch (error) {
      console.warn(`[storage] failed to read legacy v${version} ${suffix}`, error)
    }
  }

  if (!found) return null
  const current = persistedSchema.safeParse(draft)
  if (!current.success) {
    console.warn(`[storage] failed to validate assembled v${version} app state`, current.error)
    return null
  }

  const snapshot = initAppState(current.data as unknown as PersistedState)
  saveAppState(snapshot)
  for (const suffix of legacySuffixes) {
    localStorage.removeItem(`${legacyStorageKey}.${suffix}`)
  }
  return snapshot
}

export function readLegacyState(deps: LegacyMigrationDeps): HydratedAppState | null {
  for (const version of LEGACY_STORAGE_VERSIONS) {
    const migrated = readLegacyStateVersion(version, deps)
    if (migrated) return migrated
  }
  return null
}
