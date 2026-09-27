/*
  Author: Runor Ewhro
  Description: browser-side client for dispatching build evaluation work to
               a dedicated worker.
*/

import type { EvaluationSummary } from './buildEvaluationWorkerTypes'
import type { ShowcaseAnalysisInput, ShowcaseAnalysisProgress, ShowcaseAnalysisResult } from './showcaseAnalysis'
import type {
  BuildEvaluationReport,
  EvaluationReportOpts,
  DefRotEvaluationIn,
} from '@/engine/evaluation/buildEvaluation'
import type {
  EvaluationWorkerIn,
  EvaluationWorkerOut,
} from '@/engine/evaluation/buildEvaluationWorkerTypes'
import { makeEvaluationKey } from '@/engine/evaluation/buildEvaluationKey'
import { getGameDataMode } from '@/data/gameData'

type WorkerLane = 'report'
type WorkerReq = EvaluationWorkerIn extends infer Job
  ? Job extends { id: number } ? Omit<Job, 'id'> : never
  : never

const workers: Record<WorkerLane, Worker | null> = {
  report: null,
}
let nextJobId = 1
// Completed reports are large object graphs. Keep only a few recent reports in
// the one cache owner; the worker deliberately does not retain a second copy.
const MAX_REPORT_CACHE = 1
let activeReportKey: string | null = null
let activeReportCancel: Int32Array | null = null
let activeReportToken: object | null = null
const pendingJobs = new Map<number, {
  lane: WorkerLane
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  progress?: (value: ShowcaseAnalysisProgress) => void
}>()
const inFlightJobs = new Map<string, Promise<unknown>>()
const reportCache = new Map<string, BuildEvaluationReport | null>()
let scoreCache: { key: string; percent: number | null } | null = null

function canonicalReportOptions(options?: EvaluationReportOpts): EvaluationReportOpts {
  const sections = options?.sections
  return {
    alternativesLimit: options?.alternativesLimit ?? 12,
    sections: {
      rotationFeatures: sections?.rotationFeatures ?? true,
      upgradePaths: sections?.upgradePaths ?? true,
      echoStatsTable: sections?.echoStatsTable ?? true,
      evaluationTargets: sections?.evaluationTargets ?? true,
    },
  }
}

// The report worker holds the evaluation catalog and is torn down after a short
// idle period. Completed reports remain in the client cache, so teardown only
// trades a later cold start for reclaiming the worker's catalog memory.
const IDLE_TEARDOWN_MS: Record<WorkerLane, number> = { report: 1_200 }
const idleTimers: Record<WorkerLane, ReturnType<typeof setTimeout> | null> = {
  report: null,
}

function laneHasPendingJobs(lane: WorkerLane): boolean {
  for (const pending of pendingJobs.values()) {
    if (pending.lane === lane) {
      return true
    }
  }
  return false
}

function clearIdleTeardown(lane: WorkerLane): void {
  const timer = idleTimers[lane]
  if (timer != null) {
    clearTimeout(timer)
    idleTimers[lane] = null
  }
}

function scheduleIdleTeardown(lane: WorkerLane): void {
  clearIdleTeardown(lane)
  if (laneHasPendingJobs(lane)) {
    return
  }
  const delay = IDLE_TEARDOWN_MS[lane]
  if (!delay) {
    return
  }
  const timer = setTimeout(() => {
    idleTimers[lane] = null
    if (laneHasPendingJobs(lane)) {
      return
    }
    const worker = workers[lane]
    if (worker) {
      worker.terminate()
      workers[lane] = null
    }
    if (lane === 'report') {
      activeReportKey = null
    }
  }, delay)
  // Node returns a Timeout handle that would keep the event loop alive (and hang
  // tests); the browser returns a plain numeric id with no unref. Guard for both.
  ;(timer as unknown as { unref?: () => void }).unref?.()
  idleTimers[lane] = timer
}

function touchCacheEntry<T>(cache: Map<string, T>, key: string, value: T, limit: number): T {
  if (cache.has(key)) {
    cache.delete(key)
  }
  cache.set(key, value)
  while (cache.size > limit) {
    const oldestKey = cache.keys().next().value
    if (!oldestKey) {
      break
    }
    cache.delete(oldestKey)
  }
  return value
}

function readCacheEntry<T>(cache: Map<string, T>, key: string): T | undefined {
  if (!cache.has(key)) {
    return undefined
  }
  const value = cache.get(key) as T
  cache.delete(key)
  cache.set(key, value)
  return value
}

function ensureWorker(lane: WorkerLane): Worker {
  if (workers[lane]) {
    return workers[lane]
  }

  const worker = new Worker(
    new URL('@/engine/evaluation/buildEvaluation.worker.ts', import.meta.url),
    { type: 'module' },
  )

  worker.onmessage = (event: MessageEvent<EvaluationWorkerOut>) => {
    const message = event.data
    const pending = pendingJobs.get(message.id)
    if (!pending || pending.lane !== lane) {
      return
    }

    if ('progress' in message) {
      pending.progress?.(message.progress)
      return
    }
    pendingJobs.delete(message.id)
    if (message.ok) {
      pending.resolve(message.result)
    } else {
      pending.reject(new Error(message.error))
    }
    scheduleIdleTeardown(lane)
  }

  worker.onerror = (event) => {
    const error = new Error(event.message || 'Build evaluation worker failed unexpectedly')
    for (const [id, pending] of pendingJobs) {
      if (pending.lane === lane) {
        pending.reject(error)
        pendingJobs.delete(id)
      }
    }
    worker.terminate()
    if (workers[lane] === worker) workers[lane] = null
  }

  workers[lane] = worker
  return worker
}

export function cancelEvaluationReport(): void {
  activeReportToken = null
  if (activeReportCancel) {
    Atomics.store(activeReportCancel, 0, 1)
    activeReportCancel = null
  }
  if (activeReportKey) {
    inFlightJobs.delete(activeReportKey)
    activeReportKey = null
    // Termination also cancels synchronous phases and works without cross-origin
    // isolation. A replaced request cannot retain a queued payload or catalog.
    clearIdleTeardown('report')
    workers.report?.terminate()
    workers.report = null
    for (const [id, pending] of pendingJobs) {
      if (pending.lane === 'report') {
        pendingJobs.delete(id)
        pending.reject(new Error('Evaluation cancelled'))
      }
    }
  }
}

/** Release route-owned reports and worker data after a Simulation surface exits. */
export function releaseEvaluationResources(): void {
  cancelEvaluationReport()
  clearIdleTeardown('report')
  workers.report?.terminate()
  workers.report = null
  for (const [id, pending] of pendingJobs) {
    pendingJobs.delete(id)
    pending.reject(new Error('Evaluation surface closed'))
  }
  inFlightJobs.clear()
  reportCache.clear()
  scoreCache = null
}

function makeReportCancelFlag(): Int32Array | null {
  if (typeof SharedArrayBuffer === 'undefined') {
    return null
  }
  return new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT))
}

function reportJobMessage(
  payloadKey: string,
  payload: DefRotEvaluationIn,
  reportOptions: EvaluationReportOpts | undefined,
  cancelFlag: Int32Array | null,
): WorkerReq {
  return {
    key: payloadKey,
    type: 'report',
    payload,
    options: reportOptions,
    ...(cancelFlag ? { cancelBuf: cancelFlag.buffer as SharedArrayBuffer } : {}),
  }
}

function dispatchEvaluationJob(
  message: WorkerReq,
  lane: WorkerLane,
  progress?: (value: ShowcaseAnalysisProgress) => void,
): Promise<unknown> {
  if (typeof Worker === 'undefined') {
    return Promise.reject(new Error('Build evaluation worker is not available'))
  }

  return new Promise((resolve, reject) => {
    const id = nextJobId++
    pendingJobs.set(id, { lane, resolve, reject, progress })
    clearIdleTeardown(lane)
    ensureWorker(lane).postMessage({
      id,
      gameDataMode: getGameDataMode(),
      ...message,
    } satisfies EvaluationWorkerIn)
  })
}

function dispatchCachedEvaluationJob(
  key: string,
  message: WorkerReq,
  lane: WorkerLane,
  progress?: (value: ShowcaseAnalysisProgress) => void,
): Promise<unknown> {
  const inFlight = inFlightJobs.get(key)
  if (inFlight) {
    return inFlight
  }

  const job = dispatchEvaluationJob(message, lane, progress)
    .finally(() => {
      if (inFlightJobs.get(key) === job) inFlightJobs.delete(key)
    })
  inFlightJobs.set(key, job)
  return job
}

export function runEvaluationReport(
  payload: DefRotEvaluationIn,
  options: {
    force?: boolean
    reportOptions?: EvaluationReportOpts
    cacheResult?: boolean
  } = {},
): Promise<BuildEvaluationReport | null> {
  // Equivalent omitted/default section options share one cache entry instead
  // of retaining duplicate reports under syntactically different requests.
  const canonicalOptions = canonicalReportOptions(options.reportOptions)
  const reportKey = makeEvaluationKey({
    payload,
    reportOptions: canonicalOptions,
  })
  const cacheResult = options.cacheResult !== false
  if (options.force) {
    reportCache.delete(reportKey)
  } else if (cacheResult) {
    const cached = readCacheEntry(reportCache, reportKey)
    if (cached !== undefined) {
      return Promise.resolve(cached)
    }
  }

  const key = `report:${reportKey}`
  const running = inFlightJobs.get(key)
  if (running) return running as Promise<BuildEvaluationReport | null>
  if (activeReportKey && activeReportKey !== key) {
    cancelEvaluationReport()
  }
  activeReportKey = key
  const token = activeReportToken = {}
  const cancelFlag = makeReportCancelFlag()
  activeReportCancel = cancelFlag
  return dispatchCachedEvaluationJob(key, reportJobMessage(
    reportKey,
    payload,
    options.reportOptions,
    cancelFlag,
  ), 'report').then((report) => {
    const result = report as BuildEvaluationReport | null
    if (cacheResult) {
      touchCacheEntry(reportCache, reportKey, result, MAX_REPORT_CACHE)
    }
    return result
  }).finally(() => {
    if (activeReportToken === token) {
      activeReportKey = null
      activeReportCancel = null
      activeReportToken = null
    }
  })
}

export function runEvaluationScore(payload: Omit<DefRotEvaluationIn, 'simulation'>): Promise<number | null> {
  const key = `score:${makeEvaluationKey({ mode: getGameDataMode(), payload })}`
  if (scoreCache?.key === key) return Promise.resolve(scoreCache.percent)
  const running = inFlightJobs.get(key)
  if (running) return running as Promise<number | null>
  if (activeReportKey && activeReportKey !== key) cancelEvaluationReport()
  activeReportKey = key
  const token = activeReportToken = {}
  const cancelFlag = makeReportCancelFlag()
  activeReportCancel = cancelFlag
  return dispatchCachedEvaluationJob(key, {
    key, type: 'score', payload,
    ...(cancelFlag ? { cancelBuf: cancelFlag.buffer as SharedArrayBuffer } : {}),
  }, 'report').then((value) => {
    const percent = value as number | null
    if (!cancelFlag || !Atomics.load(cancelFlag, 0)) scoreCache = { key, percent }
    return percent
  }).finally(() => {
    if (activeReportToken === token) {
      activeReportKey = null
      activeReportCancel = null
      activeReportToken = null
    }
  })
}

let summaryCache: { key: string; result: EvaluationSummary | null } | null = null
export function runEvaluationSummary(payload: Omit<DefRotEvaluationIn, 'simulation'>): Promise<EvaluationSummary | null> {
  reportCache.clear()
  const key = `summary:${makeEvaluationKey({ mode: getGameDataMode(), payload })}`
  if (summaryCache?.key === key) return Promise.resolve(summaryCache.result)
  const running = inFlightJobs.get(key)
  if (running) return running as Promise<EvaluationSummary | null>
  if (activeReportKey && activeReportKey !== key) cancelEvaluationReport()
  activeReportKey = key
  const token = activeReportToken = {}
  const cancelFlag = makeReportCancelFlag()
  activeReportCancel = cancelFlag
  return dispatchCachedEvaluationJob(key, {
    key, type: 'summary', payload,
    ...(cancelFlag ? { cancelBuf: cancelFlag.buffer as SharedArrayBuffer } : {}),
  }, 'report').then((value) => {
    const result = value as EvaluationSummary | null
    if (!cancelFlag || !Atomics.load(cancelFlag, 0)) summaryCache = { key, result }
    return result
  }).finally(() => {
    if (activeReportToken === token) {
      activeReportKey = null
      activeReportCancel = null
      activeReportToken = null
    }
  })
}

// One compact result, independent from the full report cache.
let showcaseCache: { key: string; result: ShowcaseAnalysisResult } | null = null
type ProgressListener = (progress: ShowcaseAnalysisProgress) => void
let showcaseProgress: {
  key: string
  listeners: Set<ProgressListener>
  damage?: Extract<ShowcaseAnalysisProgress, { stage: 'damage' }>
  score?: Extract<ShowcaseAnalysisProgress, { stage: 'score' }>
} | null = null
export function runShowcaseAnalysis(payload: ShowcaseAnalysisInput, onProgress?: ProgressListener): Promise<ShowcaseAnalysisResult> {
  reportCache.clear()
  const key = `showcase:${makeEvaluationKey({ mode: getGameDataMode(), payload })}`
  if (showcaseCache?.key === key) {
    onProgress?.({ stage: 'damage', userDamage: showcaseCache.result.userDamage })
    onProgress?.({ stage: 'score', percent: showcaseCache.result.percent })
    return Promise.resolve(showcaseCache.result)
  }
  const running = inFlightJobs.get(key)
  if (running) {
    if (onProgress && showcaseProgress?.key === key) {
      showcaseProgress.listeners.add(onProgress)
      if (showcaseProgress.damage) onProgress(showcaseProgress.damage)
      if (showcaseProgress.score) onProgress(showcaseProgress.score)
    }
    return running as Promise<ShowcaseAnalysisResult>
  }
  if (activeReportKey && activeReportKey !== key) cancelEvaluationReport()
  activeReportKey = key
  const token = activeReportToken = {}
  const progress: NonNullable<typeof showcaseProgress> = { key, listeners: new Set(onProgress ? [onProgress] : []) }
  showcaseProgress = progress
  const cancelFlag = makeReportCancelFlag()
  activeReportCancel = cancelFlag
  return dispatchCachedEvaluationJob(key, {
    key, type: 'showcase', payload,
    ...(cancelFlag ? { cancelBuf: cancelFlag.buffer as SharedArrayBuffer } : {}),
  }, 'report', (value) => {
    if (value.stage === 'damage') progress.damage = value
    else progress.score = value
    for (const listener of progress.listeners) listener(value)
  }).then((value) => {
    const result = value as ShowcaseAnalysisResult
    if (!cancelFlag || !Atomics.load(cancelFlag, 0)) showcaseCache = { key, result }
    return result
  }).finally(() => {
    progress.listeners.clear()
    if (showcaseProgress === progress) showcaseProgress = null
    if (activeReportToken === token) {
      activeReportKey = null
      activeReportCancel = null
      activeReportToken = null
    }
  })
}
