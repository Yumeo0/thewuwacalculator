/*
  Author: Runor Ewhro
  description: the persisted application document: the calculation slices the
               core models plus the ui slice the app stores alongside them.
*/

import type { SavedArtifactLibrary } from '@wuwacalc/core/domain/entities/inventoryStorage'
import type { OptSets } from '@wuwacalc/core/domain/entities/optimizer'
import type { ResonatorId } from '@wuwacalc/core/domain/entities/runtime'
import type { ScenarioWorkspace } from '@wuwacalc/core/domain/entities/scenarioLibrary'
import type { SuggestState, WeaponPlanSet } from '@wuwacalc/core/domain/entities/suggestions'
import type { UiState } from '@/domain/entities/uiState'
import type { APP_STATE_VER } from './appStateVersion'

/** the calculation slices of the persisted document, without the ui slice. */
export type CalculationState = Omit<PersistedState, 'ui'>

export interface SimulationState {
  /** resonator whose derived build choices the current optimizer settings belong to. */
  optimizerSettingsResonatorId: ResonatorId | null
  optimizerSettings: OptSets
  weaponSuggests: WeaponPlanSet
  suggestionsByResonatorId: Record<string, SuggestState>
}

export interface PersistedState {
  version: typeof APP_STATE_VER
  ui: UiState
  /** canonical live combat state, independent of simulation tooling. */
  combat: ScenarioWorkspace
  /** user-authored snapshots, independent from any simulation surface. */
  library: SavedArtifactLibrary
  simulation: SimulationState
}

export type HydratedAppState = PersistedState
