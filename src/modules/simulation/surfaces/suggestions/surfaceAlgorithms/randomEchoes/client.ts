/*
  Author: Runor Ewhro
  Description: Owns the random-Echo worker lifecycle and correlates concurrent
               suggestion requests with their asynchronous replies.
*/

import { getGameDataMode } from '@/data/gameData'
import type {
  RandomEchoEntry,
  RandomEchoPrep,
  RandomEchoWorkerRequest,
  RandomEchoWorkerResponse,
} from './types'

let worker: Worker | null = null
let nextJobId = 1
let idleTimer: ReturnType<typeof setTimeout> | null = null
const IDLE_TEARDOWN_MS = 1_200

const pendingJobs = new Map<number, {
  resolve: (value: RandomEchoEntry[]) => void
  reject: (error: Error) => void
}>()

function clearIdleTeardown(): void {
  if (idleTimer !== null) clearTimeout(idleTimer)
  idleTimer = null
}

function scheduleIdleTeardown(): void {
  if (pendingJobs.size > 0 || !worker) return
  clearIdleTeardown()
  idleTimer = setTimeout(() => {
    idleTimer = null
    if (pendingJobs.size > 0) return
    worker?.terminate()
    worker = null
  }, IDLE_TEARDOWN_MS)
  ;(idleTimer as unknown as { unref?: () => void }).unref?.()
}

function ensureWorker(): Worker {
  clearIdleTeardown()
  if (worker) {
    return worker
  }

  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })

  worker.onmessage = (event: MessageEvent<RandomEchoWorkerResponse>) => {
    const message = event.data
    const pending = pendingJobs.get(message.id)
    if (!pending) {
      return
    }

    pendingJobs.delete(message.id)
    if (message.ok) {
      pending.resolve(message.result)
    } else {
      pending.reject(new Error(message.error))
    }
    scheduleIdleTeardown()
  }

  worker.onerror = (event) => {
    const error = new Error(event.message || 'Random Echo worker failed unexpectedly')
    for (const pending of pendingJobs.values()) {
      pending.reject(error)
    }
    pendingJobs.clear()
    worker?.terminate()
    worker = null
    clearIdleTeardown()
  }

  return worker
}

export function runRandomEchoSuggestions(
    payload: RandomEchoPrep,
): Promise<RandomEchoEntry[]> {
  return new Promise((resolve, reject) => {
    const id = nextJobId++
    pendingJobs.set(id, { resolve, reject })

    const message: RandomEchoWorkerRequest = {
      id,
      gameDataMode: getGameDataMode(),
      payload,
    }
    try {
      ensureWorker().postMessage(message)
    } catch (error) {
      pendingJobs.delete(id)
      reject(error instanceof Error ? error : new Error('Could not start the random Echo worker'))
      scheduleIdleTeardown()
    }
  })
}
