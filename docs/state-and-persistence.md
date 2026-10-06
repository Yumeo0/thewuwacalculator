# State And Persistence

## Summary

The composed app store owns saved preferences, combat scenarios, Simulation settings, saved builds and rotations, and runtime projections. Focused Zustand stores own temporary optimizer and inventory UI state.

## Persisted State

Primary files:

- [packages/core/src/domain/entities/appState.ts](../packages/core/src/domain/entities/appState.ts)
- [src/application/state/store.ts](../src/application/state/store.ts)
- [src/application/state/optimizerRunStore.ts](../src/application/state/optimizerRunStore.ts)
- [src/application/state/inventoryUiStore.ts](../src/application/state/inventoryUiStore.ts)
- [packages/core/src/engine/runtime/schema.ts](../packages/core/src/engine/runtime/schema.ts)
- [src/application/persistence/storage.ts](../src/application/persistence/storage.ts)
- [src/application/persistence/scenarioRecords.ts](../src/application/persistence/scenarioRecords.ts)
- [src/application/persistence/persistenceCoordinator.ts](../src/application/persistence/persistenceCoordinator.ts)
- [src/application/persistence/storageCodec.ts](../src/application/persistence/storageCodec.ts)
- [src/application/persistence/legacyMigration.ts](../src/application/persistence/legacyMigration.ts)

Current persisted roots are:

- `ui`: appearance, layout, Modulation and Showcase preferences, editor preferences, and picker memory
- `combat`: canonical scenarios and selected scenario
- `simulation`: optimizer settings and suggestion state
- `library`: saved Echoes, builds, rotations, and scenarios

Character progression and equipment are stored with each member in the combat scenario. Simulation tools calculate the runtime data they need from that scenario.

## Granular Storage Domains

The storage layer writes explicit domains:

- `ui.appearance`
- `ui.layout`
- `ui.showcaseCards`
- `ui.savedRotationPreferences`
- `combat.workspace`
- `simulation.optimizerSettings`
- `simulation.suggestions`
- `library.echoes`
- `library.builds`
- `library.rotations`
- `library.scenarios`

Inventory-backed domains hydrate separately so the initial Home and Read experience does not need to load the full library.
Saved rotations contain immutable scenario snapshots and can become substantially larger than the other artifacts. Their domain is stored with synchronous LZ compression to stay within Web Storage quotas; the reader still accepts earlier plain-JSON v28 values and rewrites them in the compressed format after hydration.

## Runtime Materialization

Primary files:

- [packages/core/src/engine/runtime/runtimeAdapters.ts](../packages/core/src/engine/runtime/runtimeAdapters.ts)
- [packages/core/src/engine/runtime/runtimeMaterialization.ts](../packages/core/src/engine/runtime/runtimeMaterialization.ts)
- [packages/core/src/engine/runtime/combatGraph.ts](../packages/core/src/engine/runtime/combatGraph.ts)

Runtime adapters convert saved scenario members, team assignments, controls, and conditions into calculation inputs for each resonator and teammate. Selectors provide those inputs to Modulation, Rotation, Showcase, Optimizer, Suggestions, and evaluation.

## Evaluation And Showcase Preferences

Current UI preference names describe their consumer:

- `animatedRailPortraits`
- `showcaseCards`

The version 28 migration accepts the prior `benchAnim2d` and `benchmarkCards` keys, then writes only the current names. The retired `showBenchStates` and `showEvaluationStates` preferences are discarded during loading. The old root `calculator` key is likewise read only as an import/migration boundary and normalized to `simulation` plus the canonical `combat` and `library` roots.

## Transient State

Optimizer progress and results live in `optimizerRunStore`; inventory panel state lives in `inventoryUiStore`. Worker state, inventory loading flags, open modals, and other temporary UI state are not saved. Check whether a value should survive reloads before changing persistence.

## Writeback And Recovery

App providers debounce dirty-domain writes and flush on page hide and `beforeunload`. Loaded domains pass through their owning schema or specialized reader before they are applied; most structured slices use Zod, while Showcase cards and scenario records have dedicated persistence boundaries. A failed domain write is reported independently and does not prevent later dirty domains from being saved. Legacy-version keys and recovery records are retained only to support safe migration and cleanup.

## Related Docs

- [architecture.md](./architecture.md)
- [app-shell-and-routing.md](./app-shell-and-routing.md)
- [feature-surfaces.md](./feature-surfaces.md)
