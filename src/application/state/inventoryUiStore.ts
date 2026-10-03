/*
  Author: Runor Ewhro
  Description: Owns session-only inventory mounting, visibility, and query
               state outside the canonical saved inventory.
*/

import { create } from 'zustand'

interface InventoryUiStore {
  open: boolean
  mounted: boolean
  echoQuery: string
  setOpen: (open: boolean) => void
  setEchoQuery: (query: string) => void
}

export const useInventoryUiStore = create<InventoryUiStore>((set) => ({
  open: false,
  mounted: false,
  echoQuery: '',
  setOpen: (open) => set((state) => ({ open, mounted: state.mounted || open })),
  setEchoQuery: (echoQuery) => set({ echoQuery }),
}))
