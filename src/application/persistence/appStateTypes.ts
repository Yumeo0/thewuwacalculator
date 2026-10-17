/*
  Author: Runor Ewhro
  description: host-owned persisted app state: the calculation slices provided by
               the core plus the ui slice the app stores alongside them.
*/

import type { PersistedState as CalculationState } from '@wuwacalc/core/domain/entities/appState'
import type { PersistedUnknown as CalculationUnknown } from '@/application/persistence/hydration'
import type { StoredUiState, UiState } from '@/domain/entities/uiState'

export interface PersistedState extends CalculationState {
  ui: UiState
}

export type HydratedAppState = PersistedState

export type PersistedUnknown = CalculationUnknown & {
  ui: StoredUiState
}
