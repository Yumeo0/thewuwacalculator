# App Shell And Routing

## Summary

The visible information architecture is `Home > Read / Simulation`. URLs stay flat; the hierarchy is expressed by the chrome and module ownership rather than nested public paths.

## Bootstrap

Primary files:

- [src/main.tsx](../src/main.tsx)
- [src/app/AppRoot.tsx](../src/app/AppRoot.tsx)
- [src/app/providers/AppProviders.tsx](../src/app/providers/AppProviders.tsx)

The route-appropriate core or scoped game data loads before React mounts. App-wide persistence, theme, wallpaper, font, tooltip, context-menu, and selection providers then wrap the router. Google OAuth is installed only around the Calibration page, where Drive backup controls use it.

## Public Routes

Primary files:

- [src/shared/lib/appRoutes.ts](../src/shared/lib/appRoutes.ts)
- [src/app/router/routeTable.tsx](../src/app/router/routeTable.tsx)
- [src/app/nav/routeChunks.ts](../src/app/nav/routeChunks.ts)

Home:

- `/`

Simulation tools:

- `/modulation`
- `/rotation`
- `/showcase`
- `/optimizer`
- `/suggestions`

Read pages:

- `/guides`
- `/docs`
- `/changelog`
- `/privacy`
- `/terms`

Settings is now Calibration at `/calibration`; `/settings` redirects to it.

`/home` redirects to `/`, and `/progression` and `/calculator` redirect to `/modulation`. What's New is an act on Home: `/changelog/whatsnew` redirects to `/#whatsnew`, and `/changelog/whatsnew#<release id>` to `/#whatsnew-<release id>`. Old nested tool URLs redirect to their flat counterparts.

## Shared Simulation Workspace

[SimulationPage.tsx](../src/modules/simulation/shell/SimulationPage.tsx) initializes shared Simulation providers. Modulation, Showcase, Optimizer, and Suggestions use one persistent parameterized route and [BuildWorkspaceSurface.tsx](../src/modules/simulation/workspace/BuildWorkspaceSurface.tsx), so the roster, quick-action rail, and shared build controls stay mounted when the active tool changes. Rotation has a separate editor under the same providers.

Route chunks preserve lazy loading and prewarm tool modules on navigation intent.

## Responsive And Mobile Presentation

`src/shared/responsive/policy.json` owns the app-wide layout widths, phone
capability query, and mobile-route IDs. `mobileUi.ts` resolves the current
presentation from that policy, with a temporary `?ui=mobile` or `?ui=desktop`
override and a page-local manual override. It does not save a mode choice to
persistent preferences. Mobile route components provide presentation for the
same feature state and domain behavior; shared mobile primitives live under
`src/shared/ui/mobile`, module-specific mobile components stay with their
feature, and global mobile styles live under `src/styles/mobile`.

## Retired Pages

The legacy Calculator and the beta-only legacy Optimizer are retired. Their code is archived outside the build in the git-ignored `legacy/` folder at the repository root, under the same paths it had in `src/`. The former Benchmark and standalone Progression pages are gone too. Historical `/calculator`, `/progression` and `/calculator/benchmark` links redirect to Modulation.

## Route Chrome

Primary files:

- [src/app/shell/AppLayout.tsx](../src/app/shell/AppLayout.tsx)
- [src/app/shell/ChromeHeader.tsx](../src/app/shell/ChromeHeader.tsx)
- [src/application/navigation/appIndex.ts](../src/application/navigation/appIndex.ts)

`AppLayout` provides the route layout, global overlays, route effects, roster display area, and page outlet. `ChromeHeader` renders the header. The header links directly to Simulation tools and puts Docs, Guides, Changelog, Calibration, Privacy, and Terms in the Read dropdown. Home is the root page.

## Related Docs

- [architecture.md](./architecture.md)
- [feature-surfaces.md](./feature-surfaces.md)
- [state-and-persistence.md](./state-and-persistence.md)
