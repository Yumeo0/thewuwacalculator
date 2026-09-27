/*
  Author: Runor Ewhro
  Description: Retains saved scenario snapshots while a consumer owns a lease and
               delays final eviction to avoid repeated storage parsing.
*/

import { useEffect } from 'react'
import { useAppStore } from '@/application/state'

export function useSavedRotationsLease(active = true): void {
  const acquire = useAppStore((state) => state.acquireSavedRotationsLease)

  useEffect(() => {
    if (!active) return undefined
    return acquire()
  }, [acquire, active])
}
