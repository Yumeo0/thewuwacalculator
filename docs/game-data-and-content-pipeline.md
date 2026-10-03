# Game Data And Content Pipeline

## Summary

This document explains the format of runtime data, how the app loads it into catalogs and the registry, and which scripts produce it. Use it when changing runtime JSON, registry initialization, authored content, or data generation.

## Checked In Runtime Data

Runtime JSON is stored under `public/data`:

- `resonator-catalog.json`
- `resonator-details.json`
- `resonator-sources.json`
- `weapon-data.json`
- `echo-catalog.json`
- `echo-sources.json`
- `echo-stats.json`
- `sonata-sets.json`
- `sonata-set-defs.json`
- `enemies.json`

These files are part of the production app contract. They are fetched at startup and treated as required runtime infrastructure.

## Initialization Flow

Primary file:

- [src/data/gameData/index.ts](../src/data/gameData/index.ts)

Initialization sequence:

1. fetch checked in runtime files from `/data/*`
2. initialize direct catalogs for resonators, details, weapons, echoes, echo stats, and sonata sets
3. build shared source package lists from resonators, echoes, weapons, and sets
4. construct the game data registry from those source packages
5. cache the registry globally for later access

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
- checked in catalog files that the browser can fetch at startup without additional server generation

The docs should focus on those output contracts rather than on hidden local producer internals.

## Checked In Build And Ingest Scripts

Checked in scripts live mainly under `scripts/ingest` and `scripts/assets`.

Important checked in flows:

- fetch resonator source data
- build resonator module output
- build resonator index output
- fetch weapon data and build weapon module output
- fetch echo data and build echo module output
- sync resonator images
- apply authored resonator overrides

These scripts refresh or change the runtime data loaded by the production app.

## Authored Overrides

The resonator override files under `scripts/ingest/resonatorOverrides/` are a central part of the data pipeline. They are where authored corrections, additions, or behavior shaping can override fallback generated output before the checked in runtime artifacts are finalized.

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
