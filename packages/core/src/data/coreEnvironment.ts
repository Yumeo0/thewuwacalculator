/*
  Author: Runor Ewhro
  Description: Host-facing configuration for the calculation core. Defines the
               game-data source contract, the default same-origin fetch source,
               and environment policies owned by the host application.
*/

import type { GameDataMode } from '@core/domain/entities/gameDataMode'

/** Supplies game-data documents to the core. Hosts may serve them over HTTP,
 * read them from disk, or inject fixtures in tests. `path` is relative to the
 * mode root, for example `resonators/sources.json`. */
export interface GameDataSource {
  load<T>(mode: GameDataMode, path: string): Promise<T>
}

export interface FetchGameDataSourceOptions {
  /** Root served by the host. Defaults to the app's same-origin `/data`. */
  baseUrl?: string
  /** Fetch implementation override, mostly for tests. */
  fetch?: typeof globalThis.fetch
}

/** Default source: `<baseUrl>/<mode>/<path>`, mirroring the hosted layout. */
export function createFetchGameDataSource(options: FetchGameDataSourceOptions = {}): GameDataSource {
  const baseUrl = (options.baseUrl ?? '/data').replace(/\/+$/, '')
  const request = options.fetch ?? ((url: string) => globalThis.fetch(url))

  return {
    async load<T>(mode: GameDataMode, path: string): Promise<T> {
      const url = `${baseUrl}/${mode}/${path.replace(/^\/+/, '')}`
      let response: Response
      try {
        response = await request(url)
      } catch (error) {
        if (error instanceof TypeError) {
          throw new Error(
            `Game data request failed for "${url}". Relative URLs require a browser location; ` +
            'configure an absolute baseUrl or a custom GameDataSource via configureCore().',
            { cause: error },
          )
        }
        throw error
      }
      if (!response.ok) {
        throw new Error(`Game data request failed with ${response.status} for ${url}`)
      }
      return await response.json() as T
    },
  }
}

export interface CoreConfig {
  /** Overrides where game data comes from. Defaults to the same-origin fetch source. */
  gameData?: GameDataSource
  /** Host factory for calculation workers. Environments without browser Worker
   * support may return a compatible shim (for example worker_threads). */
  createWorker?: (role: CoreWorkerRole) => Worker
  /** Host policy for kit retention: return true while loaded kits must stay
   * resident (for example a Simulation route is active). Defaults to retaining
   * outside a browser document so offline tools and tests keep their data. */
  shouldRetainGameData?: () => boolean
}

/** Calculation workers owned by the core. Hosts map these roles to bundler
 * specific worker entry points. */
export type CoreWorkerRole =
  | 'evaluation'
  | 'suggestions'
  | 'optimizer-task'
  | 'optimizer-theory'
  | 'optimizer-compile'

const fetchSource = createFetchGameDataSource()
let coreConfig: CoreConfig = {}

/** Installs host configuration. Calls merge, so later calls can override
 * individual fields without restating the rest. */
export function configureCore(config: CoreConfig): void {
  coreConfig = { ...coreConfig, ...config }
}

export function getCoreConfig(): Readonly<CoreConfig> {
  return coreConfig
}

export function getGameDataSource(): GameDataSource {
  return coreConfig.gameData ?? fetchSource
}

export function shouldRetainGameData(): boolean {
  const policy = coreConfig.shouldRetainGameData
  return policy ? policy() : typeof window === 'undefined'
}

export function createCoreWorker(role: CoreWorkerRole): Worker {
  const factory = coreConfig.createWorker
  if (!factory) {
    throw new Error(
      `No worker factory configured for "${role}". ` +
      'Call configureCore({ createWorker }) and map core worker roles to your bundler entry points.',
    )
  }
  return factory(role)
}
