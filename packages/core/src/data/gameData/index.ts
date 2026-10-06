/*
  Author: Runor Ewhro
  Description: Builds and caches the full game-data source package list
               and the derived registry used across Simulation tools.
*/

import { initEchoCat } from '@core/data/gameData/catalog/echoes'
import { initEchoStts, type EchoSttsCatD } from '@core/data/gameData/catalog/echoStats'
import { initSntSets, type SntSetDef } from '@core/data/gameData/catalog/sonataSets'
import { initEchoSetD, sntSetSrcs, type SetDef } from '@core/data/gameData/echoSets/effects'
import type { GameDataReg, SrcPkg } from '@core/domain/gameData/contracts'
import { mkGameDataRe } from '@core/data/gameData/registry'
import { materializeResonatorStatesById } from '@core/domain/gameData/resonatorStateGraph'
import type { EchoDef } from '@core/domain/entities/catalog'
import type { ResSeed } from '@core/domain/entities/runtime'
import type { ResDtls } from '@core/domain/entities/resonator'
import type { GenWpn } from '@core/domain/entities/weapon'
import type { SkillDamageEntry } from '@core/domain/entities/stats'
import { DEF_GAME_DATA_MODE, type GameDataMode } from '@core/domain/entities/gameDataMode'
import { getResCatByI, initResCat, initResDtls, initResKitSeeds } from '@core/data/gameData/resonators/resonatorDataStore'
import { initWpnData } from '@core/data/gameData/weapons/weaponDataStore'
import { decodeCoreWeaponCatalog, type CoreWeaponCatalog } from '@core/data/gameData/weapons/coreCatalog'
import { getGameDataSource, shouldRetainGameData } from '@core/data/coreEnvironment'
import { GAME_DATA_SCHEMA_VERSION } from '@core/data/gameData/constants'

const GAME_DATA_KEY = '__wuwaGameDataState__'

const loadGameData = <T>(mode: GameDataMode, path: string): Promise<T> =>
  getGameDataSource().load<T>(mode, path)

/** Owns registry subscriptions and delayed release around the HMR-safe data state. */
export class GameDataSession {
  private readonly registryListeners = new Set<() => void>()
  private nonSimulationReleaseTimer: ReturnType<typeof setTimeout> | null = null
  private trimTimer: ReturnType<typeof setTimeout> | null = null

  getState(): GameDataGlbl {
    const scope = globalThis as typeof globalThis & { [GAME_DATA_KEY]?: GameDataGlbl }
    const existing = scope[GAME_DATA_KEY]
    if (existing) {
      // Development hot reload can retain an older singleton shape.
      existing.commonSources ??= null
      existing.commonRegistry ??= null
      existing.coreCatalogs ??= null
      existing.knownFeatureIds ??= null
      existing.bundles ??= new Map()
      existing.pendingBundles ??= new Map()
      existing.retainedIds ??= new Set()
      existing.leases ??= new Map()
      return existing
    }
    const created: GameDataGlbl = {
      registry: null,
      initializationPromise: null,
      mode: null,
      resonatorScope: null,
      commonSources: null,
      commonRegistry: null,
      coreCatalogs: null,
      knownFeatureIds: null,
      bundles: new Map(),
      pendingBundles: new Map(),
      retainedIds: new Set(),
      leases: new Map(),
    }
    scope[GAME_DATA_KEY] = created
    return created
  }

  hydrate(registry: GameDataReg, mode: GameDataMode): void {
    const state = this.getState()
    this.installRegistry(state, registry)
    state.initializationPromise = Promise.resolve()
    state.mode = mode
    state.resonatorScope = null
    state.commonSources = null
    state.commonRegistry = null
    state.coreCatalogs = null
    state.releaseRequested = false
    state.knownFeatureIds = null
    state.bundles.clear()
    state.pendingBundles.clear()
    state.retainedIds.clear()
    state.leases.clear()
  }

  mode(): GameDataMode { return this.getState().mode ?? DEF_GAME_DATA_MODE }

  onChange(listener: () => void): () => void {
    this.registryListeners.add(listener)
    return () => { this.registryListeners.delete(listener) }
  }

  installRegistry(state: GameDataGlbl, registry: GameDataReg): void {
    state.registry = registry
    for (const listener of this.registryListeners) listener()
  }

  cancelRelease(): void {
    if (this.nonSimulationReleaseTimer !== null) clearTimeout(this.nonSimulationReleaseTimer)
    this.nonSimulationReleaseTimer = null
  }

  scheduleRelease(state: GameDataGlbl): void {
    if (shouldRetainGameData()) return
    this.cancelRelease()
    this.nonSimulationReleaseTimer = setTimeout(() => {
      this.nonSimulationReleaseTimer = null
      if (this.getState() === state && !shouldRetainGameData()) this.releaseCalculationData()
    }, 1_200)
  }

  scheduleTrim(state: GameDataGlbl): void {
    if (this.trimTimer !== null) clearTimeout(this.trimTimer)
    this.trimTimer = setTimeout(() => {
      this.trimTimer = null
      if (this.getState() === state) this.retain([...state.retainedIds])
    }, 0)
  }

  hold(state: GameDataGlbl, ids: readonly string[]): () => void {
    const lease = {}
    state.leases.set(lease, ids)
    return () => {
      state.leases.delete(lease)
      if (state.releaseRequested && state.leases.size === 0) {
        // Allow a draft's cleanup/setup pair to settle before releasing kits.
        setTimeout(() => {
          if (this.getState() === state && state.releaseRequested && state.leases.size === 0) {
            this.releaseCalculationData()
          }
        }, 0)
        return
      }
      this.scheduleTrim(state)
    }
  }

  releaseCalculationData(): void {
    this.cancelRelease()
    const state = this.getState()
    if (state.coreOnly || !state.registry) return
    state.releaseRequested = true
    if (state.leases.size > 0) return
    const sourceKeys = state.coreCatalogs?.sourceStubs
      ?? Object.values(state.registry.sourcesByKey).map((source) => ({ source: source.source })) as SrcPkg[]
    const retained = new Map([...state.bundles].filter(([id]) => state.retainedIds.has(id)))
    state.bundles = retained
    if (state.coreCatalogs) state.coreCatalogs.bundles = new Map(retained)
    if (state.coreCatalogs) initWpnData(state.coreCatalogs.weapons)
    initResKitSeeds(Object.fromEntries([...retained].flatMap(([id, bundle]) => bundle.seed ? [[id, bundle.seed]] : [])))
    initResDtls(Object.fromEntries([...retained].flatMap(([id, bundle]) => bundle.details ? [[id, bundle.details]] : [])))
    state.commonSources = null
    state.commonRegistry = null
    state.coreOnly = true
    state.releaseRequested = false
    state.resonatorScope = `core:${[...retained.keys()].sort().join(',')}`
    this.installRegistry(state, mkGameDataRe(sourceKeys))
  }

  retain(ids: readonly string[]): void {
    const state = this.getState()
    if (!state.commonSources) return
    state.retainedIds = new Set(ids)
    const held = new Set([...state.retainedIds, ...[...state.leases.values()].flat()])
    const recent = [...state.bundles.keys()].filter((id) => !held.has(id))
    let changed = false
    for (const id of recent.slice(0, Math.max(0, recent.length - RECENT_RESONATOR_LIMIT))) {
      state.bundles.delete(id)
      changed = true
    }
    if (changed) rebuildScopedRegistry(state)
  }

  async ensureResonators(ids: readonly string[]): Promise<void> {
    const state = this.getState()
    if (!state.registry) throw new Error('Game data is not initialized')
    if (state.coreOnly) {
      await initGameData({ mode: state.mode ?? DEF_GAME_DATA_MODE, resonatorIds: [...new Set([...state.retainedIds, ...ids])] })
      this.scheduleRelease(state)
      return
    }
    if (state.commonSources === null) return
    const release = this.hold(state, ids)
    let changed = false
    const results = await Promise.allSettled([...new Set(ids)].filter((id) => getResCatByI()[id]).map(async (id) => {
      const existing = state.bundles.get(id)
      if (existing) {
        state.bundles.delete(id)
        state.bundles.set(id, existing)
        return
      }
      let pending = state.pendingBundles.get(id)
      if (!pending) {
        pending = (async () => {
          const bundle = await loadGameData<ResonatorWorkerBundle>(state.mode!, `resonators/worker-bundles/${encodeURIComponent(id)}.json`)
          if (bundle.source.source.id !== id) throw new Error(`Unexpected resonator data: ${id}`)
          state.bundles.set(id, bundle)
        })().finally(() => state.pendingBundles.delete(id))
        state.pendingBundles.set(id, pending)
      }
      await pending
      changed = true
    }))
    if (changed) rebuildScopedRegistry(state)
    setTimeout(release, 0)
    this.scheduleRelease(state)
    const failed = results.find((result) => result.status === 'rejected')
    if (failed?.status === 'rejected') throw failed.reason
  }

  async initialize(options: {
    mode?: GameDataMode
    resonatorIds?: readonly string[]
    calculationOnly?: boolean
    weaponIds?: readonly string[]
  } = {}): Promise<void> {
    const state = this.getState()
    this.cancelRelease()
    state.releaseRequested = false
    const mode = options.mode ?? DEF_GAME_DATA_MODE
    const resonatorIds = options.resonatorIds
      ? Array.from(new Set(options.resonatorIds)).sort()
      : null
    const weaponIds = [...new Set(options.weaponIds ?? [])].filter((id) => id && id !== '0').sort()
    const calculationOnly = Boolean(options.calculationOnly && resonatorIds)
    const resonatorScope = resonatorIds
      ? `${resonatorIds.join(',')}${calculationOnly ? `|calculation:${weaponIds.join(',')}` : ''}`
      : null

    if (state.registry && state.mode === mode && state.resonatorScope === resonatorScope) {
      return
    }

    if (state.initializationPromise && (state.mode !== mode || state.resonatorScope !== resonatorScope)) {
      await state.initializationPromise.catch(() => undefined)
    }

    const fallbackCoreRegistry = state.coreOnly && state.mode === mode ? state.registry : null
    const fallbackCoreScope = fallbackCoreRegistry ? state.resonatorScope : null

    if (state.registry && (state.mode !== mode || state.resonatorScope !== resonatorScope)) {
      state.registry = null
      state.initializationPromise = null
    }

    if (!state.initializationPromise) {
      state.mode = mode
      state.resonatorScope = resonatorScope
      const core = state.coreCatalogs?.mode === mode ? state.coreCatalogs : null
      state.initializationPromise = (async () => {
        const featureIdsRequest = resonatorIds && !calculationOnly
          ? core ? Promise.resolve(core.featureIds)
            : loadGameData<string[]>(mode, 'resonators/feature-ids.json')
          : Promise.resolve<string[]>([])
        const runtimeBundles = calculationOnly ? Promise.all(resonatorIds!.map((id) =>
          loadGameData<ResonatorWorkerBundle>(mode, `resonators/runtime-bundles/${encodeURIComponent(id)}.json`))) : null
        const weaponBundles = calculationOnly ? Promise.all(weaponIds.map((id) =>
          loadGameData<{ weapon: GenWpn; source: SrcPkg | null }>(mode, `weapons/runtime-bundles/${encodeURIComponent(id)}.json`))) : null
        const resCatRequest = runtimeBundles
          ? runtimeBundles.then((bundles) => bundles.flatMap((bundle) => bundle.seed ? [bundle.seed] : []))
          : core && resonatorIds ? Promise.resolve(core.seeds)
            : loadGameData<ResSeed[]>(mode, resonatorIds ? 'resonators/picker-catalog.json' : 'resonators/catalog.json')
        const resonatorData = resonatorIds
          ? (runtimeBundles ?? resCatRequest.then((catalog) => Promise.all(resonatorIds.filter((id) => catalog.some((seed) => seed.id === id)).map(async (id): Promise<ResonatorWorkerBundle> => {
            const cached = core?.bundles.get(id)
            if (cached) return cached
            return loadGameData<ResonatorWorkerBundle>(mode, `resonators/worker-bundles/${encodeURIComponent(id)}.json`)
          })))).then((bundles) => ({
            sources: bundles.map((bundle) => bundle.source),
            seeds: Object.fromEntries(bundles.flatMap((bundle) => bundle.seed ? [[bundle.seed.id, bundle.seed]] : [])),
            details: Object.fromEntries(bundles.flatMap((bundle) => bundle.details
              ? [[bundle.source.source.id, bundle.details] as const]
              : [])),
          }))
          : Promise.all([
            loadGameData<SrcPkg[]>(mode, 'resonators/sources.json'),
            loadGameData<SkillDamageEntry[]>(mode, 'resonators/damage-entries.json'),
            loadGameData<Record<string, ResDtls>>(mode, 'resonators/details.json'),
          ]).then(([sources, damageEntries, details]) => {
            const entriesById = new Map<string, SkillDamageEntry[]>()
            for (const entry of damageEntries) {
              const entries = entriesById.get(entry.resonatorId) ?? []
              entries.push(entry)
              entriesById.set(entry.resonatorId, entries)
            }
            return {
              seeds: {} as Record<string, ResSeed>,
              sources: sources.map((source) => ({
                ...source,
                damageEntries: entriesById.get(source.source.id) ?? [],
              })),
              details,
            }
          })
        const [
          resonators,
          echoSources,
          enemySources,
          weaponSources,
          weaponData,
          coreWeaponData,
          resCat,
          echoCatalog,
          echoStats,
          sonataSets,
          echoSetDefs,
          featureIds,
          sourceManifest,
        ] =
          await Promise.all([
            resonatorData,
            loadGameData<SrcPkg[]>(mode, 'echoes/sources.json'),
            loadGameData<SrcPkg[]>(mode, 'enemies/sources.json'),
            weaponBundles ? weaponBundles.then((bundles) => bundles.flatMap((bundle) => bundle.source ? [bundle.source] : [])) : loadGameData<SrcPkg[]>(mode, 'weapons/sources.json'),
            weaponBundles ? weaponBundles.then((bundles) => bundles.map((bundle) => bundle.weapon)) : loadGameData<GenWpn[]>(mode, 'weapons/catalog.json'),
            calculationOnly ? Promise.resolve<GenWpn[]>([])
              : core ? Promise.resolve(core.weapons)
                : loadGameData<CoreWeaponCatalog>(mode, 'weapons/core-catalog.json').then(decodeCoreWeaponCatalog),
            resCatRequest,
            core ? Promise.resolve(core.echoes) : loadGameData<EchoDef[]>(mode, 'echoes/catalog.json'),
            core ? Promise.resolve(core.echoStats) : loadGameData<EchoSttsCatD>(mode, 'echoes/stats.json'),
            core ? Promise.resolve(core.sonataSets) : loadGameData<SntSetDef[]>(mode, 'sonata/sets.json'),
            core ? Promise.resolve(core.echoSets) : loadGameData<SetDef[]>(mode, 'sonata/effects.json'),
            featureIdsRequest,
            core ? Promise.resolve({ sources: core.sourceStubs.map((stub) => stub.source), featureIds: core.featureIds })
              : loadGameData<SourceManifest>(mode, 'source-manifest.json'),
          ])

        assertDataSchema(sourceManifest)

        initResCat(resCat)
        if (resonatorIds) initResKitSeeds(resonators.seeds)
        initResDtls(resonators.details)
        initWpnData(weaponData)
        initEchoCat(normEchoCat(echoCatalog))
        initEchoStts(echoStats)
        initSntSets(sonataSets)
        initEchoSetD(echoSetDefs)

        const commonSources: SrcPkg[] = [
          ...echoSources,
          ...enemySources,
          ...weaponSources,
          ...sntSetSrcs,
        ]

        state.knownFeatureIds = new Set([
          ...featureIds,
          ...commonSources.flatMap((source) => (source.features ?? []).map((feature) => feature.id)),
          ...resonators.sources.flatMap((source) => (source.features ?? []).map((feature) => feature.id)),
        ])
        state.commonSources = resonatorIds ? commonSources : null
        state.commonRegistry = resonatorIds ? mkGameDataRe(commonSources) : null
        state.retainedIds = new Set(resonatorIds ?? [])
        state.bundles.clear()
        if (resonatorIds) {
          for (const source of resonators.sources) {
            state.bundles.set(source.source.id, { source, details: resonators.details[source.source.id] ?? null, seed: resonators.seeds[source.source.id] })
          }
        }
        state.coreCatalogs = {
          mode,
          sourceStubs: sourceManifest.sources.map((source) => ({ source })),
          seeds: resCat,
          bundles: new Map([...state.bundles]),
          weapons: coreWeaponData,
          echoes: echoCatalog,
          echoStats,
          sonataSets,
          echoSets: echoSetDefs,
          featureIds: [...state.knownFeatureIds],
        }
        this.installRegistry(state, mkGameDataRe(resonatorIds ? resonators.sources : [...resonators.sources, ...commonSources], {
          resonatorStatesById: materializeResonatorStatesById(resonators.details),
          base: state.commonRegistry ?? undefined,
        }))
        state.coreOnly = false
      })().catch((error) => {
        const nextState = this.getState()
        nextState.initializationPromise = null
        if (!nextState.registry && fallbackCoreRegistry) {
          nextState.mode = mode
          nextState.resonatorScope = fallbackCoreScope
          nextState.coreOnly = true
          this.installRegistry(nextState, fallbackCoreRegistry)
        } else if (!nextState.registry) {
          nextState.mode = null
          nextState.resonatorScope = null
        }
        throw error
      })
    }

    await state.initializationPromise
  }

  async initializeCore(options: { mode?: GameDataMode; resonatorIds?: readonly string[] } = {}): Promise<void> {
    const state = this.getState()
    const mode = options.mode ?? DEF_GAME_DATA_MODE
    if (state.registry && state.mode === mode) return
    if (state.initializationPromise) await state.initializationPromise.catch(() => undefined)
    if (state.registry && state.mode === mode) return
    const ids = [...new Set(options.resonatorIds ?? [])]
    state.mode = mode
    state.resonatorScope = `core:${ids.sort().join(',')}`
    state.initializationPromise = (async () => {
      const [seeds, bundles, weapons, echoes, echoStats, sonataSets, echoSets, manifest] = await Promise.all([
        loadGameData<ResSeed[]>(mode, 'resonators/picker-catalog.json'),
        Promise.all(ids.map((id) =>
          loadGameData<ResonatorWorkerBundle>(mode, `resonators/worker-bundles/${encodeURIComponent(id)}.json`))),
        loadGameData<CoreWeaponCatalog>(mode, 'weapons/core-catalog.json').then(decodeCoreWeaponCatalog),
        loadGameData<EchoDef[]>(mode, 'echoes/catalog.json'),
        loadGameData<EchoSttsCatD>(mode, 'echoes/stats.json'),
        loadGameData<SntSetDef[]>(mode, 'sonata/sets.json'),
        loadGameData<SetDef[]>(mode, 'sonata/effects.json'),
        loadGameData<SourceManifest>(mode, 'source-manifest.json'),
      ])
      assertDataSchema(manifest)
      const details = Object.fromEntries(bundles.flatMap((bundle) => bundle.details ? [[bundle.source.source.id, bundle.details]] : []))
      initResCat(seeds)
      initResKitSeeds(Object.fromEntries(bundles.flatMap((bundle) => bundle.seed ? [[bundle.seed.id, bundle.seed]] : [])))
      initResDtls(details)
      initWpnData(weapons)
      initEchoCat(normEchoCat(echoes))
      initEchoStts(echoStats)
      initSntSets(sonataSets)
      initEchoSetD(echoSets)
      state.knownFeatureIds = new Set(manifest.featureIds)
      state.retainedIds = new Set(ids)
      state.bundles = new Map(bundles.map((bundle) => [bundle.source.source.id, bundle]))
      state.commonSources = null
      state.commonRegistry = null
      state.coreCatalogs = {
        mode,
        sourceStubs: manifest.sources.map((source) => ({ source })),
        seeds,
        bundles: new Map(bundles.map((bundle) => [bundle.source.source.id, bundle])),
        weapons,
        echoes,
        echoStats,
        sonataSets,
        echoSets,
        featureIds: manifest.featureIds,
      }
      state.coreOnly = true
      // Source identities are sufficient for persisted-state validation. The
      // full source graph is rebuilt only when a calculation route is entered.
      this.installRegistry(state, mkGameDataRe(state.coreCatalogs.sourceStubs))
    })().catch((error) => {
      state.initializationPromise = null
      state.registry = null
      throw error
    })
    await state.initializationPromise
  }
}

const gameDataSession = new GameDataSession()

/** Derived caches must release removed kits as soon as the registry changes. */
export function onGameDataChange(listener: () => void): () => void {
  return gameDataSession.onChange(listener)
}

function installRegistry(state: GameDataGlbl, registry: GameDataReg): void {
  gameDataSession.installRegistry(state, registry)
}

type GameDataGlbl = {
  registry: GameDataReg | null
  initializationPromise: Promise<void> | null
  mode: GameDataMode | null
  resonatorScope: string | null
  commonSources: SrcPkg[] | null
  commonRegistry?: GameDataReg | null
  coreCatalogs?: CoreCatalogs | null
  knownFeatureIds: Set<string> | null
  bundles: Map<string, ResonatorWorkerBundle>
  pendingBundles: Map<string, Promise<void>>
  retainedIds: Set<string>
  leases: Map<object, readonly string[]>
  coreOnly?: boolean
  releaseRequested?: boolean
}

function getGameDataG(): GameDataGlbl {
  return gameDataSession.getState()
}

export function hydrGameData(registry: GameDataReg, mode: GameDataMode = DEF_GAME_DATA_MODE): void {
  gameDataSession.hydrate(registry, mode)
}

export function getGameDataMode(): GameDataMode {
  return gameDataSession.mode()
}

function normPblcSstP(path: string): string {
  return path.startsWith('/public/') ? path.slice('/public'.length) : path
}

function normEchoCat(catalog: EchoDef[]): EchoDef[] {
  return catalog.map((echo) => ({
    ...echo,
    icon: normPblcSstP(echo.icon),
  }))
}

interface ResonatorWorkerBundle {
  source: SrcPkg
  details: ResDtls | null
  seed?: ResSeed
}

interface CoreCatalogs {
  mode: GameDataMode
  sourceStubs: SrcPkg[]
  seeds: ResSeed[]
  bundles: Map<string, ResonatorWorkerBundle>
  weapons: GenWpn[]
  echoes: EchoDef[]
  echoStats: EchoSttsCatD
  sonataSets: SntSetDef[]
  echoSets: SetDef[]
  featureIds: string[]
}

interface SourceManifest {
  version?: number
  sources: Array<SrcPkg['source']>
  featureIds: string[]
}

function assertDataSchema(manifest: SourceManifest): void {
  if (manifest.version == null || manifest.version === GAME_DATA_SCHEMA_VERSION) return
  throw new Error(
    `Game data schema version ${manifest.version} is not supported by this build ` +
    `(expected ${GAME_DATA_SCHEMA_VERSION}). Refresh the hosted data or update the library.`,
  )
}

// Omitted IDs preserve the full registry for offline tools and migrations.
// Browser and worker entry points request only their current team.
export function initGameData(options: {
  mode?: GameDataMode
  resonatorIds?: readonly string[]
  calculationOnly?: boolean
  weaponIds?: readonly string[]
} = {}): Promise<void> {
  return gameDataSession.initialize(options)
}

/** Boot routes that only need catalogs and persisted-state validation without
 * constructing the calculation registry and all of its derived indexes. */
export function initCoreGameData(options: { mode?: GameDataMode; resonatorIds?: readonly string[] } = {}): Promise<void> {
  return gameDataSession.initializeCore(options)
}

// get the global game-data registry (must call initializeGameData first)
export function getGameData(): GameDataReg {
  const state = getGameDataG()
  if (!state.registry) {
    throw new Error('Game data not initialized, call initializeGameData() first')
  }

  return state.registry
}

// The browser keeps full picker metadata but only a bounded set of detailed
// kits. Full initialization remains available to offline tools and migrations.
const RECENT_RESONATOR_LIMIT = 3

export function hasResonatorData(ids: readonly string[]): boolean {
  const state = getGameDataG()
  return Boolean(state.registry && !state.coreOnly && (state.commonSources === null || ids.every((id) => !getResCatByI()[id] || state.bundles.has(id))))
}

function rebuildScopedRegistry(state: GameDataGlbl): void {
  if (!state.commonSources || !state.commonRegistry) return
  const details: Record<string, ResDtls> = {}
  const seeds: Record<string, ResSeed> = {}
  const sources: SrcPkg[] = []
  for (const [id, bundle] of state.bundles) {
    sources.push(bundle.source)
    if (bundle.details) details[id] = bundle.details
    if (bundle.seed) seeds[id] = bundle.seed
  }
  initResKitSeeds(seeds)
  initResDtls(details)
  installRegistry(state, mkGameDataRe(sources, {
    resonatorStatesById: materializeResonatorStatesById(details),
    base: state.commonRegistry,
  }))
  state.resonatorScope = [...state.bundles.keys()].sort().join(',')
}

export async function ensureResonatorData(ids: readonly string[]): Promise<void> {
  return gameDataSession.ensureResonators(ids)
}

/** Keep a kit resident while a detached modal or configuration draft uses it. */
export function holdResonatorData(ids: readonly string[]): () => void {
  return gameDataSession.hold(getGameDataG(), ids)
}

/** Return to the catalog-only registry after leaving Simulation. Detached
 * modals can keep a kit lease and delay this release until they close. */
export function releaseCalculationGameData(): void {
  gameDataSession.releaseCalculationData()
}

export function retainResonatorData(ids: readonly string[]): void {
  gameDataSession.retain(ids)
}

/** Validity metadata remains complete even when a detailed kit is not resident. */
export function getKnownFeatureIds(): ReadonlySet<string> {
  const state = getGameDataG()
  return state.knownFeatureIds ??= new Set(Object.values(getGameData().featuresBySourceKey).flatMap((features) => features.map((feature) => feature.id)))
}
