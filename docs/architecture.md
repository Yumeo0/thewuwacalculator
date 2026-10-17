# Architecture

See [lifecycle-owners.md](./lifecycle-owners.md) for the class boundaries around workers, caches, persistence coordination, and GPU resources.

## Runtime Boot Flow

Primary entrypoints:

- [src/main.tsx](../src/main.tsx)
- [packages/core/src/data/gameData/index.ts](../packages/core/src/data/gameData/index.ts)
- [src/app/AppRoot.tsx](../src/app/AppRoot.tsx)
- [src/app/providers/AppProviders.tsx](../src/app/providers/AppProviders.tsx)

Startup order:

1. Bootstrap reads the persisted `live` or `beta` data mode and the resonators needed by the saved combat workspace.
2. Simulation entry routes call `initGameData()` for that scope; Home and Read routes call `initCoreGameData()` for the smaller core catalog set.
3. Catalog initializers load the requested resonator, weapon, Echo, Sonata, enemy, and manifest data from `public/data/<mode>`.
4. Source packages are combined into the shared registry. `GameDataSession` retains scoped bundles and loads additional resonator or weapon bundles when a consumer requests them.
5. React mounts only after the selected startup scope is ready.
6. `AppProviders` installs persistence flushing, theme sync, wallpaper sync, font sync, tooltips, context menus, and floating selection actions. Google OAuth is scoped to Calibration.
7. `AppRoot` renders the router; `AppLayout` handles route tracking, cookie bootstrap, global hosts, the header, and the routed outlet.

The important constraint is that the route-appropriate core registry must exist before React mounts. Detailed resonator and weapon bundles may load later, but consumers must acquire the required scope before rendering data-dependent Simulation work.

## Core Package

The calculation core is a separate workspace package, `packages/core` (`@wuwacalc/core`), with an app-facing facade at `packages/core/src/index.ts`. The app keeps importing through its `@wuwacalc/core/*` alias, which points at the package source during development.

Boundaries:

- Host app code imports the core through `@wuwacalc/core/*`; core internals import each other through `@core/*`.
- The core must not import app code, React, or Zustand, and the app must not use the `@core/*` alias. `npm run check:architecture` enforces both.
- The core is calculation only: app state and its persisted document (schema, hydration, migrations, ui slice) live in `src/application/persistence`, app-owned entities in `src/domain/entities`, and presentation (labels, number formats, accents, icons, grades) stays in host code. Core reports keys and numbers.
- Game data I/O and workers are host-provided seams: hosts call `configureCore({ createWorker })` from `src/app/coreWorkers.ts`, and the fetch-backed `GameDataSource` from `src/main.tsx`.
- `npm run build -w packages/core` emits `dist/` JavaScript and declarations; `npm run smoke -w packages/core` packs the tarball and imports it from a throwaway consumer.

## Top Level Layers

### `src/app`

Thin application orchestration:

- router setup
- shell composition
- global providers

This layer configures the router, shell, and providers.

### `src/application`

Application-wide state and use cases:

- Zustand store composition and selectors
- persistence coordination and imports
- navigation and context-menu contracts
- theme, media, and integration-facing hooks

This layer coordinates domain, data, engine, and infrastructure code; route modules render the corresponding pages.

### `packages/core/src/data`

Checked in runtime game data, catalog loaders, set effect bootstrapping, and scoring tables, published as `@wuwacalc/core`. Authored app content (guides, changelog) stays app-side in `src/data/content`.

This layer loads checked-in JSON for the domain and engine layers. It does not import the engine.

### `packages/core/src/domain`

Durable concepts and contracts:

- app state entities
- runtime entities
- game data contracts and registry types
- game-data contracts
- pure entities and value types
- domain-only services

This layer defines profiles, runtimes, inventory entries, optimizer settings, enemy profiles, and related types without depending on application state, catalogs, or engine execution.

### `packages/core/src/engine`

Calculation heavy and rule heavy logic:

- formulas
- effect evaluation
- pipeline simulation
- rotation inspection
- suggestions
- optimizer compiler, search, encoding, workers, CPU, GPU, and result materialization

This layer is framework agnostic. UI modules call into it through selectors, helpers, and store actions. Echo image parsing is app-side in `src/echoParser`.

### `src/infra`

External integration and environment specific code:

- browser blob storage
- Google Drive sync
- OAuth token exchange and refresh
- analytics
- cookies

This layer handles platform-specific storage and external integration behavior.

### `src/modules`

Route-facing feature surfaces:

- `home`
- `read`
- `simulation`
- `calibration`
- `system`

UI.

### `src/shared`

Reusable UI primitives and low level helpers:

- modals
- toasts
- context menus
- tooltip system
- small utility stores and helpers

`shared` provides reusable code and cannot import application or feature modules.

### Responsive policy and mobile presentation

`src/shared/responsive/policy.json` defines app-wide layout widths, the phone
capability query, and route IDs with a dedicated mobile shell. The responsive
policy module exposes those settings to TypeScript, and Vite substitutes the
configured widths into CSS placeholders at build time. Component-specific
media queries remain with their components.

`src/shared/responsive/mobileUi.ts` handles mode resolution and temporary UI-mode
overrides. Shared mobile components are in `src/shared/ui/mobile`, and feature
specific mobile components are in each module's `mobile/` directory. Global
mobile styles are in `src/styles/mobile`. Mobile components use the existing
feature state, domain rules, and persistence contracts.

The import direction and source boundary are enforced by `npm run check:architecture`. App source cannot import files outside `src/`; app-to-module and cross-module imports must use an explicit `api/` or route `pages/` entry. The git-ignored root archives are therefore outside the app import graph.

### `src/styles`

Stylesheets
- `base/`: reset, tokens, themes, responsive overrides, cross-cutting polish
- `app/`: the shell, route chrome and navigation motion
- `ui/`: app-wide primitives (modal language, popups, menus, select, toast, loader, pickers)
- `features/`: simulation pieces shared by several surfaces (echoes, inventory, teams, resonator, buffs, enemies, controls, weapons)
- `surfaces/`: one folder per Simulation surface (bench, showcase, optimizer, rotation, suggestions)
- `mobile/`: global phone-only presentation; module-specific phone components live with their feature
- `pages/`: Home, Read, Calibration and system pages

`styles/index.css` imports the global layers in cascade order, and `src/index.css` only imports it. Mobile-only styles are grouped under `styles/mobile`; a few large surface sheets load with their component chunks.

Class names are short block codes (`amdl`, `pkr`, `wk`, `fcm`, `rte`) with BEM elements and modifiers (`fcm__item`, `wk-echo--empty`).

## Route And Shell Model

Primary files:

- [src/app/router/routeTable.tsx](../src/app/router/routeTable.tsx)
- [src/app/shell/AppLayout.tsx](../src/app/shell/AppLayout.tsx)
- [src/app/shell/ChromeHeader.tsx](../src/app/shell/ChromeHeader.tsx)
- [src/modules/simulation/shell/SimulationPage.tsx](../src/modules/simulation/shell/SimulationPage.tsx)

Navigation groups pages under `Home > Read / Simulation`, while URLs remain flat. Home is `/`. Simulation tools are `/modulation`, `/rotation`, `/showcase`, `/optimizer`, and `/suggestions`. Read includes Guides, Docs, Changelog, Privacy, and Terms. What's New is a Home section. The header links directly to Simulation tools and puts reference pages and Calibration in the Read dropdown.

Pages mount under `AppLayout`; `ChromeHeader` handles header interaction, `AppLayout` handles global shell behavior, and `GlobalHosts` renders application-wide portals and notices.

See [app-shell-and-routing.md](./app-shell-and-routing.md) for detail.

## Game Data And Registry Model

Primary files:

- [packages/core/src/data/gameData/index.ts](../packages/core/src/data/gameData/index.ts)
- [packages/core/src/domain/gameData/contracts.ts](../packages/core/src/domain/gameData/contracts.ts)
- [packages/core/src/data/gameData/registry.ts](../packages/core/src/data/gameData/registry.ts)

The runtime data model has two main layers.

Catalog layer:

- resonator catalog and details
- weapon data
- echo catalog
- echo stat tables
- sonata sets
- enemies

Registry layer:

- source packages
- owners
- states
- conditions
- effects
- features
- rotations
- skills

The catalogs provide direct lookup data. The registry provides executable relationships and shared effect definitions. Resonators, weapons, echoes, and sets use the same effect system; React components consume its results.

See [game-data-and-content-pipeline.md](./game-data-and-content-pipeline.md) for detail.

## Store, Runtime, And Persistence Model

Primary files:

- [src/application/state/store.ts](../src/application/state/store.ts)
- [src/application/state/scenarioSlice.ts](../src/application/state/scenarioSlice.ts)
- [src/application/state/resonatorSlice.ts](../src/application/state/resonatorSlice.ts)
- [src/application/state/inventorySlice.ts](../src/application/state/inventorySlice.ts)
- [src/application/state/optimizerSlice.ts](../src/application/state/optimizerSlice.ts)
- [src/application/state/uiSlice.ts](../src/application/state/uiSlice.ts)
- [src/application/state/optimizerRunStore.ts](../src/application/state/optimizerRunStore.ts)
- [src/application/state/inventoryUiStore.ts](../src/application/state/inventoryUiStore.ts)
- [packages/core/src/engine/runtime/runtimeAdapters.ts](../packages/core/src/engine/runtime/runtimeAdapters.ts)
- [packages/core/src/engine/runtime/runtimeMaterialization.ts](../packages/core/src/engine/runtime/runtimeMaterialization.ts)
- [src/application/persistence/storage.ts](../src/application/persistence/storage.ts)

The app distinguishes between:

- persisted app state
- materialized runtime state
- transient execution state

Persisted state stores combat scenarios, inventory, optimizer settings, and saved UI preferences.

Runtime adapters expand that into active runtime structures for the engine:

- active resonator runtime
- teammate runtime views
- selected target maps
- team slot layout
- derived workspace bundles

Transient stores track optimizer progress, results, and inventory panel state; resource managers control worker lifetimes, and persisted actions use the app store's domain-specific write path.

Persistence is granular by domain.

See [state-and-persistence.md](./state-and-persistence.md) for detail.

## Simulation and Optimizer Model

Primary files:

- [packages/core/src/engine/pipeline/index.ts](../packages/core/src/engine/pipeline/index.ts)
- [packages/core/src/engine/pipeline/buildCombatContext.ts](../packages/core/src/engine/pipeline/buildCombatContext.ts)
- [packages/core/src/engine/pipeline/simulateRotation.ts](../packages/core/src/engine/pipeline/simulateRotation.ts)
- [packages/core/src/engine/suggestions/core.ts](../packages/core/src/engine/suggestions/core.ts)
- [packages/core/src/engine/optimizer/engine.ts](../packages/core/src/engine/optimizer/engine.ts)

The shared execution model is:

1. build or reuse a combat graph
2. build a combat context for the target slot
3. resolve effects and final stats
4. resolve skills, rows, and rotation outputs
5. return results to the UI or use them for ranking

Optimizer extends the same model by:

- compiling inventory and runtime state into packed execution payloads
- counting legal combinations
- executing worker coordinated CPU or GPU searches
- materializing compact result refs back into user facing loadouts

See:

- [calculation-and-runtime-engine.md](./calculation-and-runtime-engine.md)
- [optimizer-and-suggestions.md](./optimizer-and-suggestions.md)

## Deployment And Operational Model

Primary files:

- [src/cloudflare/worker.ts](../src/cloudflare/worker.ts)
- [src/infra/googleDrive/server/googleOAuthServer.ts](../src/infra/googleDrive/server/googleOAuthServer.ts)
- [wrangler.jsonc](../wrangler.jsonc)
- [package.json](../package.json)

The production deployment is a Cloudflare Worker plus static assets from `dist`.

The worker handles:

- serve static assets through Cloudflare assets
- intercept `/api/exchange-code`
- intercept `/api/refresh-token`
- create and retrieve shared payloads under `/api/shares` and `/api/shares/*`

OAuth uses Worker variables plus the `GOOGLE_CLIENT_SECRET` secret. Share persistence uses the production `SHARES` KV binding. Everything else falls through to the SPA asset handler.

See [deployment-and-operations.md](./deployment-and-operations.md) for detail.

## Focused Docs

- [docs index](./README.md)
- [app shell and routing](./app-shell-and-routing.md)
- [state and persistence](./state-and-persistence.md)
- [game data and content pipeline](./game-data-and-content-pipeline.md)
- [calculation and runtime engine](./calculation-and-runtime-engine.md)
- [optimizer and suggestions](./optimizer-and-suggestions.md)
- [feature surfaces](./feature-surfaces.md)
- [deployment and operations](./deployment-and-operations.md)
