# @wuwacalc/core

Framework-free calculation core for the Wuthering Waves build calculator. It owns the checked-in game data, the domain contracts, and all calculation logic: the simulation pipeline, evaluation, Suggestions, and the Optimizer (CPU and WebGPU).

The package has no UI dependencies (no React, no Zustand) and does not fetch or spawn workers on its own. Hosts inject those through two seams, so the same core can run in a browser app, a Node tool, or a test harness.

## Layout

- `src/data` - game data bootstrap, catalogs, scoring tables, and the host-facing `GameDataSource` contract (`src/data/coreEnvironment.ts`)
- `src/domain` - durable entities, game-data contracts, and shared value types
- `src/engine` - simulation pipeline, evaluation, Suggestions, Optimizer (workers and WGSL shaders included), and rotation runtime
- `src/shared` - low-level helpers such as the worker channel

The public facade is `src/index.ts`. Deep imports under `@wuwacalc/core/*` remain supported for advanced use.

## Host Seams

1. Game data: pass a `GameDataSource`, or keep the default same-origin fetch source.
2. Workers: map each `CoreWorkerRole` to a bundler worker entry point. Keep the `new Worker(new URL(...))` call inline so Vite and similar bundlers emit worker chunks.

```ts
import {
  configureCore,
  createFetchGameDataSource,
  initGameData,
  pipeline,
} from '@wuwacalc/core'

configureCore({
  gameData: createFetchGameDataSource({ baseUrl: '/data' }),
  createWorker: (role) =>
    new Worker(new URL(`./workers/${role}.js`, import.meta.url), { type: 'module' }),
  shouldRetainGameData: () => true,
})

await initGameData({ mode: 'live', resonatorIds: ['1208'] })
const result = pipeline.runResSmlt(runtime, seed, enemy, teammates)
```

Worker-backed paths throw until `configureCore({ createWorker })` is called. `initCoreGameData` loads catalogs only and is enough for boot routes that just validate persisted state.

Deep imports stay available:

```ts
import { executeRotationProgram } from '@wuwacalc/core/engine/rotation/execute'
```

## Development

```bash
npm run build -w packages/core      # tsc + tsc-alias + asset copy -> dist/
npm test -w packages/core           # vitest, standalone from the app
npm run typecheck -w packages/core  # tsc -p tsconfig.json --noEmit
npm run smoke -w packages/core      # pack + install + import the tarball
```

Requires Node >= 20. The build emits ESM and declarations to `dist/`; `prepack` runs the build so `npm pack` always ships fresh output.

## Conventions

- Core internals import each other through `@core/*`; the emitted output uses relative `.js` paths.
- Hosts import through `@wuwacalc/core/*` and must not use `@core/*`.
- The core must not import app code, React, or Zustand. `npm run check:architecture` enforces both directions.

## Status

Extracted from the app, not published yet. The package stays `private: true` while its distribution is evaluated. This repository is source available, not open source; see the root `LICENSE.md` for the full terms.
