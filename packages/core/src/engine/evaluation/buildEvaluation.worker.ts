/*
  Author: Runor Ewhro
  Description: runs build evaluation jobs inside a dedicated web worker.
*/

/// <reference lib="webworker" />

import { computeShowcaseAnalysis } from './showcaseAnalysis'
import { initGameData } from '@core/data/gameData'
import {
  ensureAnchorStoreHydrated,
  rotationBuildEvaluationReport,
} from '@core/engine/evaluation/buildEvaluation'
import { prepareRotationBuildScore } from '@core/engine/evaluation/evaluation/report'
import type {
  EvaluationWorkerIn,
  EvaluationWorkerOut,
} from '@core/engine/evaluation/buildEvaluationWorkerTypes'

const scope = self as DedicatedWorkerGlobalScope
const REPORT_CANCEL_ERR = 'Build evaluation report superseded'

function makeCancelCheck(message: EvaluationWorkerIn): (() => void) | undefined {
  if (!message.cancelBuf) {
    return undefined
  }

  const view = new Int32Array(message.cancelBuf)
  return () => {
    if (Atomics.load(view, 0) !== 0) {
      throw new Error(REPORT_CANCEL_ERR)
    }
  }
}

function buildReport(message: Extract<EvaluationWorkerIn, { type: 'report' }>): ReturnType<typeof rotationBuildEvaluationReport> {
  return rotationBuildEvaluationReport(
    message.payload,
    message.options ?? {},
    makeCancelCheck(message),
  )
}

scope.onmessage = async (event: MessageEvent<EvaluationWorkerIn>) => {
  const message = event.data

  try {
    const contexts = message.type === 'showcase' ? [message.payload.evaluation, message.payload.live] : [message.payload]
    const participants = contexts.flatMap((context) => [context.runtime, ...Object.values(context.runtimesById)])
    const resonatorIds = [...new Set(participants.map((runtime) => runtime.id))]
    await initGameData({ mode: message.gameDataMode, resonatorIds, calculationOnly: true,
      weaponIds: participants.flatMap((runtime) => runtime.build.weapon.id ? [runtime.build.weapon.id] : []),
    })
    // Rehydrate persisted anchors before the first search so a cold worker (idle
    // teardown / page reload) can re-score from disk instead of re-searching.
    if (message.type === 'report' || message.type === 'score' || message.type === 'summary') await ensureAnchorStoreHydrated()
    makeCancelCheck(message)?.()
    const result = message.type === 'report' ? buildReport(message)
      : message.type === 'summary' ? prepareRotationBuildScore(message.payload)?.calculateSummary(makeCancelCheck(message)) ?? null
      : message.type === 'score' ? prepareRotationBuildScore(message.payload)?.calculatePercent(makeCancelCheck(message)) ?? null
      : await computeShowcaseAnalysis(
      message.payload,
      makeCancelCheck(message),
      (progress) => scope.postMessage({ id: message.id, progress } satisfies EvaluationWorkerOut),
    )

    const response: EvaluationWorkerOut = {
      id: message.id,
      ok: true,
      result,
    }
    scope.postMessage(response)
  } catch (error) {
    const response: EvaluationWorkerOut = {
      id: message.id,
      ok: false,
      error: error instanceof Error ? error.message : 'Build evaluation worker failed unexpectedly',
    }
    scope.postMessage(response)
  }
}
