/*
  Author: Runor Ewhro
  Description: Shares the active evaluation summary with workspace descendants
               without widening their dependency on evaluation ownership.
*/

import { createContext, useContext } from 'react'
import type { EvaluationSummary } from '@/engine/evaluation/buildEvaluationWorkerTypes'
export const EvaluationSummaryContext = createContext<EvaluationSummary | null>(null)
export const useWorkspaceEvaluationSummary = () => useContext(EvaluationSummaryContext)
