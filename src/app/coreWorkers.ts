/*
  Author: Runor Ewhro
  Description: Maps core calculation worker roles to the app's bundler worker
               entry points so the core stays bundler agnostic. The worker URLs
               stay inline in `new Worker(new URL(...))` so vite bundles them.
*/

import { configureCore, type CoreWorkerRole } from '@wuwacalc/core/data/coreEnvironment'

const CORE_WORKERS: Record<CoreWorkerRole, () => Worker> = {
  evaluation: () => new Worker(new URL('@wuwacalc/core/engine/evaluation/buildEvaluation.worker.ts', import.meta.url), { type: 'module' }),
  suggestions: () => new Worker(new URL('@wuwacalc/core/engine/suggestions/worker.ts', import.meta.url), { type: 'module' }),
  'optimizer-task': () => new Worker(new URL('@wuwacalc/core/engine/optimizer/workers/task.worker.ts', import.meta.url), { type: 'module' }),
  'optimizer-theory': () => new Worker(new URL('@wuwacalc/core/engine/optimizer/workers/theoryProducer.worker.ts', import.meta.url), { type: 'module' }),
  'optimizer-compile': () => new Worker(new URL('@wuwacalc/core/engine/optimizer/workers/compile.worker.ts', import.meta.url), { type: 'module' }),
}

export function installCoreWorkers(): void {
  configureCore({
    createWorker: (role) => CORE_WORKERS[role](),
  })
}
