# Deployment And Operations

## Summary

This document covers local development, Cloudflare deployment, OAuth, saved data, and the scripts used to maintain production game data.

## Local Development

Primary files:

- [package.json](../package.json)
- [vite.config.ts](../vite.config.ts)
- [wrangler.jsonc](../wrangler.jsonc)

Core requirements:

- Node `24.x`

Core local commands:

```bash
npm install
npm run dev
npm run build
npm test
npm run lint
```

Cloudflare local development:

```bash
npm run dev:cloudflare
```

## Production Deployment

Primary files:

- [src/cloudflare/worker.ts](../src/cloudflare/worker.ts)
- [wrangler.jsonc](../wrangler.jsonc)
- [public/_headers](../public/_headers)

Production uses:

- static assets from `dist`
- Cloudflare asset serving with SPA fallback
- a Cloudflare Worker for OAuth and share `/api/*` endpoints

The Worker handles these API routes:

- `/api/exchange-code`
- `/api/refresh-token`
- `/api/shares`
- `/api/shares/*`

Everything else falls back to static asset serving.

## Environment Variables

Important variables visible in the repo:

- `VITE_GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `SHARES` KV namespace binding

These matter in two different places:

- `VITE_*` values for browser side configuration
- server side values for OAuth exchange and refresh handling
- `SHARES` for production share payload persistence

The `beta` Wrangler environment intentionally has no OAuth variables or `SHARES` binding, so it is a frontend-only preview. Production must keep the public client and redirect variables, the `GOOGLE_CLIENT_SECRET` secret, and the KV binding configured.

## Google Drive Sync

Primary roots:

- [src/infra/googleDrive](../src/infra/googleDrive)
- [src/infra/googleDrive/server](../src/infra/googleDrive/server)

Drive sync behavior depends on:

- browser side auth setup
- token exchange and refresh endpoints
- persistence snapshot serialization
- restore and backup actions in Calibration

Drive sync backs up and restores the same data saved locally by the app.

## Persistence Operations

Primary roots:

- [src/application/persistence](../src/application/persistence)
- [src/infra/persistence](../src/infra/persistence)
- [packages/core/src/engine/runtime/schema.ts](../packages/core/src/engine/runtime/schema.ts)

`src/application/persistence` owns app-state domains, migration, scenario records, codecs, and coordinated writes. `src/infra/persistence` owns platform-specific browser storage such as IndexedDB-backed image blobs and beta-notice acknowledgement.

Operational persistence concerns include:

- schema versioning
- legacy backup handling
- recovery keys
- per domain slice reads and writes
- hydration and repair behavior after bad local data

If deployment or browser behavior changes persistence assumptions, this layer is high risk and should be checked carefully.

## Maintenance Tools And Local Scripts

Tracked build utilities:

- [tools/data](../tools/data)
- [tools/seo](../tools/seo)

The root `scripts/` folder is ignored and contains local-only ingest, asset,
and data-authoring workflows. `package.json` keeps commands for these local
scripts, but a clean clone cannot run them unless the scripts are supplied
locally. Dev and production builds use tracked `tools/` and checked-in runtime
data; they do not require `/scripts`.

Important local workflows:

- fetch resonator data
- build resonator runtime outputs
- build resonator indexes
- fetch and build weapon data
- fetch and build echo data
- apply resonator authored overrides
- sync resonator images

These workflows generate or update files that the production app loads, even
though the workflows themselves are not shipped or tracked.

## Operational Boundaries

The repository does not expose every private upstream source file used during data authoring. That is acceptable as long as:

- the checked in outputs remain documented
- the build and ingest contracts remain documented
- maintainers know which outputs are source of truth for the app at runtime

## Related Docs

- [architecture.md](./architecture.md)
- [game-data-and-content-pipeline.md](./game-data-and-content-pipeline.md)
- [state-and-persistence.md](./state-and-persistence.md)
