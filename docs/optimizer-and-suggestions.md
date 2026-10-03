# Optimizer And Suggestions

## Summary

This document covers how Suggestions and Optimizer rank builds using the shared runtime engine. Use it when changing suggestion types, Echo generation, workers, optimizer preparation, or CPU and GPU search.

## Shared Runtime Assumption

Suggestions and Optimizer do not invent a separate combat model. They reuse the same canonical scenario and runtime assumptions as Modulation and Rotation:

- active resonator runtime
- team state
- enemy state
- shared effect resolution
- shared formula system

Differences appear in how they explore and rank candidates, not in the core meaning of damage.

## Suggestions

Primary files:

- [src/engine/suggestions/core.ts](../src/engine/suggestions/core.ts)
- [src/engine/suggestions/mainStat-suggestion](../src/engine/suggestions/mainStat-suggestion)
- [src/engine/suggestions/setPlan-suggestion](../src/engine/suggestions/setPlan-suggestion)
- [src/engine/suggestions/worker.ts](../src/engine/suggestions/worker.ts)
- [src/modules/simulation/surfaces/suggestions/surfaceAlgorithms](../src/modules/simulation/surfaces/suggestions/surfaceAlgorithms)

Top level suggestion families:

- main stat suggestions
- set plan suggestions
- weapon suggestions
- random echo generation
- substat priority

Main-stat, set-plan, and weapon ranking are shared engine systems. Random Echo generation and substat priority belong to the Suggestions feature under `surfaceAlgorithms`. They may be replaced with that feature and must not become dependencies of shared engine, scoring, or optimizer code. Random generation uses its own worker for its larger searches.

Suggestion results depend on:

- selected target skill
- current runtime state
- set conditional state
- prepared scoring or ranking inputs

Main Stat and Set Plan suggestions keep the equipped Echoes. Both proposed builds and the current-build baseline exclude main-Echo passive bonuses, so the comparison measures only the main-stat or Sonata change.

Set plan suggestion rows are display-grouped after scoring. Plans with the same damage and the same contributing set-effect shape are collapsed into one row, set names are omitted, and the UI renders the grouped set icons with their piece counts. Set effects that do not change the scored damage are excluded from the visible plan even when they were present in one of the raw generated plans.

## Suggestions Worker Boundary

The shared worker runs the durable main-stat, set-plan, and weapon families. Random Echo generation has a feature-owned worker and client contract under `surfaceAlgorithms`; deleting that surface must not require editing the shared worker.

## Optimizer Overview

Primary files:

- [src/engine/optimizer/engine.ts](../src/engine/optimizer/engine.ts)
- [src/engine/optimizer/compiler](../src/engine/optimizer/compiler)
- [src/engine/optimizer/search](../src/engine/optimizer/search)
- [src/engine/optimizer/results](../src/engine/optimizer/results)
- [src/engine/optimizer/workers](../src/engine/optimizer/workers)

The optimizer pipeline is:

1. compile raw start payload into a prepared optimizer payload
2. count or derive legal search space
3. choose candidate main echo indices
4. run worker coordinated search for those candidate groups
5. optionally use GPU accelerated target or rotation execution where available
6. materialize compact result refs into user facing loadout results

## Compile Stage

The compile stage is responsible for turning app state into packed execution input:

- filtered inventory echoes
- mode specific packed execution payloads
- locked main candidate indices
- result limits
- packed context structures for target or rotation search

Search errors can originate here because CPU and GPU execution both depend on the prepared data and constraints.

## CPU And GPU Execution

Primary directories:

- [src/engine/optimizer/cpu](../src/engine/optimizer/cpu)
- [src/engine/optimizer/gpu](../src/engine/optimizer/gpu)
- [src/engine/optimizer/shaders](../src/engine/optimizer/shaders)

CPU paths provide the baseline packed search execution.

GPU paths accelerate supported target and rotation workloads by:

- packing context data into GPU friendly buffers
- dispatching compute pipelines
- reducing candidate outputs

Worker orchestration decides when those paths are available and how progress is reported back to the store.

## Worker Model

Primary files:

- [src/engine/optimizer/workers/pool.ts](../src/engine/optimizer/workers/pool.ts)
- [src/engine/optimizer/workers/poolScheduler.ts](../src/engine/optimizer/workers/poolScheduler.ts)
- [src/engine/optimizer/workers/progressTracker.ts](../src/engine/optimizer/workers/progressTracker.ts)
- [src/engine/optimizer/workers/jobPreparation.ts](../src/engine/optimizer/workers/jobPreparation.ts)
- [src/engine/optimizer/workers/compile.worker.ts](../src/engine/optimizer/workers/compile.worker.ts)
- [src/engine/optimizer/workers/task.worker.ts](../src/engine/optimizer/workers/task.worker.ts)

The worker layer exists to keep compilation, batching, and heavy search work off the main thread. Store side runtime helpers coordinate lifecycle, cancellation, and result materialization.

## Result Materialization

Primary files:

- [src/engine/optimizer/results/materialize.ts](../src/engine/optimizer/results/materialize.ts)
- [src/engine/optimizer/results/collector.ts](../src/engine/optimizer/results/collector.ts)

Search execution returns compact refs rather than immediately returning full UI objects. Materialization turns those refs back into user facing result rows and preview loadouts.

This separation matters because:

- compact refs are cheaper during search
- full UI objects are only needed after ranking
- CPU and GPU paths can share a common materialization step

## Store Coordination

Primary files:

- [src/application/state/storeOptimizerRuntime.ts](../src/application/state/storeOptimizerRuntime.ts)
- [src/application/state/store.ts](../src/application/state/store.ts)
- [src/application/state/optimizerSlice.ts](../src/application/state/optimizerSlice.ts)
- [src/application/state/optimizerRunStore.ts](../src/application/state/optimizerRunStore.ts)

The store layer owns:

- compile worker lifecycle
- run invalidation
- batch sizing
- progress updates
- final result application back into live runtime state

The engine should stay focused on compile and execution. The store should stay focused on orchestration.

## Related Docs

- [architecture.md](./architecture.md)
- [calculation-and-runtime-engine.md](./calculation-and-runtime-engine.md)
- [feature-surfaces.md](./feature-surfaces.md)
