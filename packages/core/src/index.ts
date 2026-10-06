/*
  Author: Runor Ewhro
  Description: Public entry point for @wuwacalc/core. Re-exports the stable
               environment and game-data API plus namespaced calculation
               surfaces so hosts can consume the core without deep imports.
               Deep module imports stay available for advanced use.
*/

export * from './data/coreEnvironment.ts'
export * from './data/gameData/index.ts'

export * as appState from './domain/entities/appState.ts'
export * as catalog from './domain/entities/catalog.ts'
export * as combatGraphEntities from './domain/entities/combatGraph.ts'
export * as combatScenario from './domain/entities/combatScenario.ts'
export * as gameDataContracts from './domain/gameData/contracts.ts'
export * as inventory from './domain/entities/inventoryStorage.ts'
export * as optimizerState from './domain/entities/optimizer.ts'
export * as runtimeEntities from './domain/entities/runtime.ts'
export * as stats from './domain/entities/stats.ts'

export * as optimizerCompiler from './engine/optimizer/compiler/index.ts'
export * as pipeline from './engine/pipeline/index.ts'
export * as rotation from './engine/rotation/execute.ts'
export * as runtimeDefaults from './engine/runtime/defaults.ts'

export * as scoring from './data/scoring/charStatWeights.ts'
