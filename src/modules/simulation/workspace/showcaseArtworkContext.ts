/*
  Author: Runor Ewhro
  Description: Shares an already resolved Showcase backdrop without triggering
               a second media-resolution lifecycle in workspace descendants.
*/

import { createContext } from 'react'

export const ResolvedBackdropContext = createContext<string | null>(null)
