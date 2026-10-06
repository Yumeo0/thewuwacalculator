/*
  Author: Runor Ewhro
  Description: Provides a minimal external store for high-frequency optimizer
               progress updates without subscribing the owning component state.
*/

import { useSyncExternalStore } from 'react'
import type { OptPrgr } from '@wuwacalc/core/engine/optimizer/types'

export function createOptimizerProgress(initial: OptPrgr) {
  let current = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    update: (value: OptPrgr) => { current = value; listeners.forEach((listener) => listener()) },
  }
}
export type OptimizerProgressSource = ReturnType<typeof createOptimizerProgress>
export function useOptimizerProgress(source: OptimizerProgressSource): OptPrgr {
  return useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot)
}
