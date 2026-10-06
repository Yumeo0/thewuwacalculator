/*
  Author: Runor Ewhro
  Description: Chooses which optimizer compilation pipeline to use
               based on whether the current optimizer settings are
               targeting a single skill or a full rotation run.
*/

import { makeOptSets } from '@core/engine/runtime/defaults'
import type {
  PrepOptPay,
  OptStartPay,
} from '@core/engine/optimizer/types'
import { compTgtRun } from '@core/engine/optimizer/compiler/target'
import { compRotRun } from '@core/engine/optimizer/compiler/rotation'
import { compThryRot, compThryTgt } from '@core/engine/optimizer/compiler/theory'

// Compile the raw optimizer start payload into the packed form that the
// execution layer expects.
//
// The decision is simple:
// - rotationMode = true -> build a rotation optimizer payload
// - rotationMode = false -> build a single-target-skill optimizer payload
export function compOptPay(
    input: OptStartPay,
): PrepOptPay {
  if (input.settings.searchMode === 'theory') {
    return input.settings.rotationMode
        ? compThryRot(input)
        : compThryTgt(input)
  }

  return input.settings.rotationMode
      ? compRotRun(input)
      : compTgtRun(input)
}

/** Equipped-build evaluation shares the numeric compiler, without search metadata. */
export function compileBaseline(input: import('./compileWorker.types').OptBaselineInput): PrepOptPay {
  const request: OptStartPay = { ...input, settings: { ...makeOptSets(), ...input.settings, searchMode: 'inventory' } }
  return request.settings.rotationMode
    ? compRotRun(request, { baseline: true })
    : compTgtRun(request, true)
}
