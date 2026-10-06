# Game Data And Content Pipeline

## Summary

This document explains the format of runtime data, how the app loads it into catalogs and the registry, and which scripts produce it. Use it when changing runtime JSON, registry initialization, authored content, or data generation.

## Checked In Runtime Data

Runtime JSON is stored under parallel `public/data/live` and `public/data/beta` trees. Each mode contains:

- `source-manifest.json`
- `resonators/catalog.json`, `picker-catalog.json`, `details.json`, `damage-entries.json`, `feature-ids.json`, and `sources.json`
- per-resonator `runtime-bundles/<id>.json` and `worker-bundles/<id>.json`
- `weapons/catalog.json`, `core-catalog.json`, `sources.json`, and per-weapon runtime bundles
- `echoes/catalog.json`, `sources.json`, and `stats.json`
- `sonata/sets.json` and `effects.json`
- `enemies/catalog.json`, `sources.json`, and `summary.json`

These files are part of the deployed app contract. Core routes load the smaller catalog set, while Simulation and worker consumers request the detailed bundles required by their current resonator and weapon scopes.

## Initialization Flow

Primary file:

- [packages/core/src/data/gameData/index.ts](../packages/core/src/data/gameData/index.ts)

Initialization sequence:

1. resolve the persisted data mode and use `/data/<mode>` as the runtime root
2. call `initCoreGameData()` for Home and Read, or `initGameData()` with the saved team scope for Simulation entry
3. initialize direct catalogs for the requested resonators, details, weapons, Echoes, Echo stats, Sonata sets, enemies, and source manifest
4. load resonator and weapon runtime or worker bundles when scoped consumers require them
5. build shared source package lists from resonators, Echoes, weapons, sets, and enemies
6. construct and cache the registry through `GameDataSession`, retaining and releasing detailed bundles by active leases

Catalogs provide direct lookups. The registry provides skill, state, effect, and rotation definitions used during simulation.

## Catalogs Versus Registry

Catalog responsibilities:

- direct lookup by id
- display metadata
- static tables
- details used by the UI and runtime initialization

Registry responsibilities:

- source ownership
- state definitions
- conditions
- effects
- features
- rotations
- skill level and execution metadata

This keeps display data separate from executable definitions while allowing the app to connect them by ID.

## Generated Output Formats

Some upstream producers are not fully present in git, but the outputs they feed into this repo are central to shipped behavior.

Important output formats:

- resonator source packages that resolve into feature, effect, rotation, state, and skill definitions
- weapon runtime data that can be turned into registry participating source packages
- echo source data and set definitions that can join the shared effect system
- checked-in catalogs, manifests, and scoped bundles that the browser can fetch without server-side generation

The docs should focus on those output contracts rather than on hidden local producer internals.

## Tracked Build Tools And Local Ingest Scripts

Tracked build tools live under `tools/`. They prepare assets and catalogs used
by the dev and production builds. Data ingestion and authoring scripts live in
the git-ignored root `scripts/` folder and are local-only; the corresponding
npm commands require those private scripts to be present in the working copy.
The commands are intentionally retained in `package.json` for the author's
local workflow.

Important local flows:

- fetch resonator source data
- build resonator module output
- build resonator index output
- fetch weapon data and build weapon module output
- fetch echo data and build echo module output
- sync resonator images
- apply authored resonator overrides

The local ingest scripts refresh or change runtime data loaded by the app. The
checked-in outputs under `public/data` are the runtime source consumed by the
browser and remain reviewable in Git.

## Authored Overrides

Local resonator override files under `scripts/ingest/resonatorOverrides/` are
part of the private authoring workflow. They can override fallback generated
output before runtime artifacts are finalized, but are not available in a
clean clone. The resulting checked-in runtime artifacts remain the app's
source of truth.

When documenting or debugging data behavior, treat authored overrides as source of truth ahead of generic fallback generation where the pipeline already does so.

## Authored App Content

Authored app content is stored in `src/data/content`:

- guides content
- changelog entries

This content is production content, not support material. It ships with the app and is owned by the same codebase.

## Operational Rule

If a change alters:

- the format of runtime JSON
- the meaning of a source package
- how a catalog is initialized
- how overrides apply
- how checked in content is structured

the relevant doc in this folder should change with it.

## Related Docs

- [architecture.md](./architecture.md)
- [calculation-and-runtime-engine.md](./calculation-and-runtime-engine.md)
- [deployment-and-operations.md](./deployment-and-operations.md)
