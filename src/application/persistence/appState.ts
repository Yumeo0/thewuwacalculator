/*
  Author: Runor Ewhro
  description: composes the host-owned ui slice with the calculation state the
               core owns, for storage, snapshots, and legacy imports.
*/

import { initAppState, makeAppState } from '@/application/persistence/hydration'
import type { PersistedUnknown as CalculationUnknown } from '@/application/persistence/hydration'
import { persistedSchema } from '@/application/persistence/calculationSchema'
import type { HydratedAppState } from '@/application/persistence/appStateTypes'
import type { StoredUiState } from '@/domain/entities/uiState'
import { makeDefaultUiState, normalizeUiState, persistedUiSchema } from './uiPersist'

/** fresh host state: core calculation defaults plus the default ui slice. */
export function makeAppStateWithUi(options?: { maxedFallbackProfile?: boolean }): HydratedAppState {
  return {
    ...makeAppState(options),
    ui: makeDefaultUiState(),
  }
}

/** hydrate a stored calculation state and rebuild its ui slice. */
export function initAppStateWithUi(
  state: CalculationUnknown & { ui?: StoredUiState },
): HydratedAppState {
  const { ui, ...calculation } = state
  return {
    ...initAppState(calculation as CalculationUnknown),
    ui: normalizeUiState(ui),
  }
}

/** validate a stored document: calculation slices in the core, ui slice here. */
export function parsePersistedState(doc: unknown):
  | { ok: true; state: HydratedAppState }
  | { ok: false; error: unknown } {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, error: new Error('Snapshot must be a JSON object.') }
  }

  const { ui: rawUi, ...calculation } = doc as Record<string, unknown>
  const current = persistedSchema.safeParse(calculation)
  if (!current.success) return { ok: false, error: current.error }

  const ui = persistedUiSchema.safeParse(rawUi)
  if (!ui.success) return { ok: false, error: ui.error }

  return {
    ok: true,
    state: initAppStateWithUi({ ...(current.data as CalculationUnknown), ui: ui.data as StoredUiState }),
  }
}
