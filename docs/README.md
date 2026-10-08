# Documentation

## Summary

This folder documents the production app, its maintenance workflows, and the data and runtime contracts developers need when changing it.

Use these docs in this order:

1. [architecture.md](./architecture.md)
2. the subsystem guide relevant to the area you are changing
3. the source files linked from that guide

## Documents

- [architecture.md](./architecture.md)
  High level system map. Start here.
- [app-shell-and-routing.md](./app-shell-and-routing.md)
  App bootstrap, Home / Read / Simulation routes, shell ownership, persistent workspace routing, and retired-route redirects.
- [state-and-persistence.md](./state-and-persistence.md)
  Store structure, runtime materialization, persistence slices, and hydration behavior.
- [game-data-and-content-pipeline.md](./game-data-and-content-pipeline.md)
  Runtime data, registry initialization, authored content, and build scripts.
- [calculation-and-runtime-engine.md](./calculation-and-runtime-engine.md)
  Combat context building, formulas, simulation, effects, and rotation execution.
- [optimizer-and-suggestions.md](./optimizer-and-suggestions.md)
  Suggestions, workers, optimizer preparation and search, CPU and GPU execution, and result construction.
- [feature-surfaces.md](./feature-surfaces.md)
  The pages and features owned by Home, Read, Simulation, Calibration, and System modules.
- [deployment-and-operations.md](./deployment-and-operations.md)
  Local development, Cloudflare deployment, OAuth, shares, sync, tracked build tools, and local maintenance workflows.
- [lifecycle-owners.md](./lifecycle-owners.md)
  Resource owners for workers, caches, persistence coordination, editor retention, and GPU sessions.

## Coverage Rules

These docs aim to cover:

- shipped runtime behavior
- checked in deployment and operational flows
- tracked tools that prepare runtime artifacts during dev or build
- the format of generated outputs that the app uses

These docs do not aim to deeply document:

- ignored private source files not present in git
- temporary personal scratch files
- ignored local scripts and experiments unless they materially affect shipped behavior

## Update Expectations

When a change alters:

- runtime data format
- store data format
- route ownership
- deployment setup
- a major user-facing feature
- a checked in build or ingest contract

the relevant doc in this folder should be updated in the same change.
