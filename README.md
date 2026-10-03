# The Wuwa Calculator

Fan made tools for planning, simulating, and optimizing builds in *Wuthering Waves*.

This repository contains the production app. Its navigation is `Home > Read / Simulation`. Simulation includes Modulation, Rotation, Showcase and Optimizer. Read includes guides, reference docs, the changelog and information pages. The repository also contains runtime data and the Cloudflare Worker used for deployment.

## Quick Start

Requirements:

- Node `24.x`

Install and run:

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm run build
npm test
npm run lint
npm run dev:cloudflare
npm run deploy:cloudflare
```

## Environment

Local Google Drive sync and OAuth flows expect:

```bash
VITE_GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:5174
```

Browser side configuration uses `VITE_*` values. Server side OAuth exchange and refresh use the non `VITE_*` variables.

## Repo Map

- `src/app`
  App bootstrap, providers, and router wiring.
- `src/data`
  Checked in content plus game data bootstrap and catalog loaders.
- `src/domain`
  Durable types, runtime adapters, selectors, schemas, and service lookups.
- `src/engine`
  Formulas, effects, simulation, suggestions, parser logic, and optimizer execution.
- `src/infra`
  Persistence, Google Drive sync, OAuth server handlers, cookies, and analytics.
- `src/modules/home`
  The Home page.
- `src/modules/read`
  Docs, guides, changelog, and information pages.
- `src/modules/simulation`
  Modulation, Rotation, Showcase, Optimizer, shared workspace features, and temporary legacy development pages.
- `src/modules/calibration` and `src/modules/system`
  Appearance, app preferences, data management, and system fallback pages.
- `src/shared`
  Shared UI primitives, shell components, and low level helpers.
- `public/data`
  Checked in runtime JSON fetched at startup.
- `scripts`
  Checked in maintenance workflows for runtime data and assets.
- `docs`
  Documentation for maintainers.

## Documentation

Start here:

- [docs/README.md](./docs/README.md)
- [docs/architecture.md](./docs/architecture.md)

Key subsystem references:

- [app shell and routing](./docs/app-shell-and-routing.md)
- [state and persistence](./docs/state-and-persistence.md)
- [game data and content pipeline](./docs/game-data-and-content-pipeline.md)
- [calculation and runtime engine](./docs/calculation-and-runtime-engine.md)
- [optimizer and suggestions](./docs/optimizer-and-suggestions.md)
- [feature surfaces](./docs/feature-surfaces.md)
- [deployment and operations](./docs/deployment-and-operations.md)

## Deployment

The app deploys as a Cloudflare Worker with static assets from `dist` and worker handled OAuth endpoints under `/api/*`.

Basic deploy flow:

```bash
npm install
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
npm run deploy:cloudflare
```

Deployment configuration is in [wrangler.jsonc](./wrangler.jsonc). Cross origin isolation headers are defined in [public/_headers](./public/_headers).

## License

This project is source available, not open source. See [LICENSE.md](./LICENSE.md) for the full terms.

In short, the code is provided for reference and educational use only. You may view and study it, but you may not copy, modify, redistribute, sublicense, or reuse substantial portions of it without prior written permission from the author.

## Project Notes

- unofficial fan project, not affiliated with Kuro Games
- designed, coded, and maintained by `ssjrunor`
- gameplay values are based on in game inspection plus community maintained sources and testing

## Contact

Discord:

- https://discord.gg/wNaauhE4uH
