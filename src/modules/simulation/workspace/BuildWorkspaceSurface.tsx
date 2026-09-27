/*
  Author: Runor Ewhro
  Description: Orchestrates the shared roster, rail, evaluation, and profile
               behavior for Modulation, Optimizer, Showcase, and the temporary
               legacy Evaluation view.
*/

import { EvaluationSummaryContext } from '@/modules/simulation/model/evaluationSummaryContext'
import { useEvaluationSummary } from '@/modules/simulation/model/useBuildEvaluation'
import { Suspense, startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BuildWorkspacePresentation } from './BuildWorkspacePresentation'
import { useShowcaseAnalysis } from '@/modules/simulation/surfaces/showcase/useShowcaseAnalysis'
import type { ShowcaseAnalysisInput } from '@/engine/evaluation/showcaseAnalysis'
import { computeShowcaseStats } from '@/engine/evaluation/showcaseStats'
import { useAppStore } from '@/application/state'
import {
  selActResId,
  selWorkDrvd,
} from '@/application/state'
import { seedRsntById } from '@/modules/simulation/features/resonator/lib/seedData.ts'
import { getResonator, type ResView } from '@/modules/simulation/features/resonator/lib/resonator.ts'
import type { EchoInstance, ResRuntime } from '@/domain/entities/runtime'
import type { WorkspaceSurface } from '@/shared/lib/appRoutes'
import {
  flattenScenarioRouting,
  projectScenarioUiRuntimes,
} from '@/engine/runtime/scenarioRuntime.ts'
import { getSntSetNam } from '@/data/gameData/catalog/sonataSets'
import { useEchoSrfcM } from '@/modules/simulation/features/echoes/lib/useEchoSurfaceMenu.tsx'
import { qpEchoAtSlot } from '@/modules/simulation/features/echoes/lib/equip.ts'
import { openEchoCnsl } from '@/modules/simulation/features/echoes/lib/echoConsoleStore.ts'

import { ATTR_COLORS } from '@/modules/simulation/model/display'
import {
  FULL_EVALUATION_REPORT_OPTIONS,
  MODULATION_SUMMARY_REPORT_OPTIONS,
  SCORE_ONLY_EVALUATION_REPORT_OPTIONS,
  useEvaluationReport,
  useSuggestionsRailScore,
} from '@/modules/simulation/model/useBuildEvaluation.ts'
import { useEvaluationTarget } from '@/modules/simulation/model/useEvaluationTarget.ts'
import { useStableEvaluationInputs } from '@/modules/simulation/model/useStableEvaluationInputs.ts'
import {
  applyEvaluationAsm,
  applyEvaluationMapAsm,
  makeEvaluationEnemy,
} from '@/modules/simulation/model/evaluationAssumptions.ts'
import { getTuneStrainMaxForTeam } from '@/engine/gameData/tuneStrain.ts'
import {
  getBuildEvaluationGrade,
  getBuildEvaluationTone,
} from '@/modules/simulation/model/buildEvaluationDisplay.ts'
import { makeStatsTree, makeStatsView } from '@/modules/simulation/model/statsView.ts'
import { getMaxEchoSc } from '@/engine/evaluation/echoScoring.ts'
import { useEchoScores } from '@/engine/evaluation/useEchoScoringRevision.ts'
import { getBuildStats } from '@/engine/pipeline/buildStats.ts'
import { mkPrepWork, type PrepWork } from '@/engine/pipeline/preparedWorkspace.ts'
import { selLiveRun } from '@/modules/simulation/model/selectors.ts'
import type { SimResult } from '@/engine/pipeline/types.ts'
import { scheduleAfterSettled } from '@/shared/lib/scheduleAfterSettled.ts'
import {
  cacheEchoMainStatScoringFromEvaluation,
  prepareEchoMainStatScoring,
} from '@/engine/evaluation/echoMainStatProfile.ts'
import { resResBaseSt } from '@/data/catalog/resonatorSeedService.ts'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'

import { useTstStr } from '@/shared/util/toastStore.ts'
import { useImportLanding } from '@/modules/simulation/features/echoes/lib/importLanding.ts'
import { useConfirm } from '@/shared/hooks/useConfirmation.ts'
import { mainPortal } from '@/shared/lib/portalTarget'
import { ConfirmHost } from '@/shared/ui/ConfirmationModal'
import type { EvaluationBuildSnapshot } from '@/engine/evaluation/buildEvaluation.ts'
import { Copy } from 'lucide-react'
import { useSel } from '@/modules/simulation/lib/sel.tsx'
import {
  EVALUATION_RAIL_ENTER_MS, EVALUATION_RAIL_EXIT_MS,
  type EvaluationEchoSelection, type CssVars, type DetailBuildKey,
  buildSonataPlan,
  preloadEvaluationRailImages, scheduleEvaluationTargetWork,
} from '@/modules/simulation/workspace/ui.tsx'

import {
  type BuildRosterEntry,
} from '@/modules/simulation/workspace/BuildRoster.tsx'
import { type BuildRailModel } from '@/modules/simulation/workspace/BuildRail.tsx'
import { makeRailModel as buildRailModel } from '@/modules/simulation/workspace/railModel.ts'
import { makeRosterEntries } from '@/modules/simulation/workspace/rosterModel.ts'
import { useResonatorProfileOps } from '@/modules/simulation/workspace/useResonatorProfileOps.ts'
import { ModulationReport } from '@/modules/simulation/surfaces/modulation/ModulationReport.tsx'
import type { MemberAnalysisSource } from '@/modules/simulation/surfaces/modulation/lib/memberSim.ts'
import { NarrowEvaluationBanner } from '@/modules/simulation/workspace/NarrowEvaluationBanner.tsx'
import { getEvaluationStageCtx } from '@/modules/simulation/workspace/context.tsx'
import { makeEchoSlot } from '@/modules/simulation/workspace/echoSlot.ts'
import { useWorkspaceEchoActions } from '@/modules/simulation/workspace/useWorkspaceEchoActions.ts'
import { optimizerPane, suggestionsPane } from '@/modules/simulation/shell/surfaceChunks.ts'
import AppLdrVrly from '@/shared/ui/AppLoaderOverlay.tsx'

const EMPTY_ECHO_LOADOUT: Array<EchoInstance | null> = []
const EMPTY_RUNTIME_MAP: Record<string, ResRuntime> = Object.freeze({})
const EMPTY_TARGETS: Record<string, string | null> = Object.freeze({})
// Defer report construction beyond the 460ms drawer transition so its worker
// and lazy module work do not contend with the transition.
const REPORT_ASIDE_WORK_DELAY_MS = 500

const EmbeddedOptimizer = optimizerPane.Mount
const EmbeddedSuggestions = suggestionsPane.Mount
function useSettledLiveRun(work: PrepWork | null, ownerKey: string): {
  simulation: SimResult | null
  ready: boolean
} {
  const [completed, setCompleted] = useState<{
    ownerKey: string
    work: PrepWork
    simulation: SimResult | null
  } | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect -- releases a different member's result at the idle-work boundary. */
  useEffect(() => {
    setCompleted((previous) => work && previous?.ownerKey === ownerKey ? previous : null)
    if (!work) return undefined
    return scheduleAfterSettled(() => {
      setCompleted({ ownerKey, work, simulation: selLiveRun(work) })
    })
  }, [ownerKey, work])
  /* eslint-enable react-hooks/set-state-in-effect */

  return {
    simulation: completed?.ownerKey === ownerKey ? completed.simulation : null,
    ready: Boolean(work && completed?.ownerKey === ownerKey && completed.work === work),
  }
}

export function BuildWorkspaceSurface({ page }: { page: WorkspaceSurface }) {
  const showToast = useTstStr((state) => state.show)
  const confirmation = useConfirm()
  const portalTarget = mainPortal()
  const [detailBuildKey, setDetailBuildKey] = useState<DetailBuildKey>('active')
  const [reportOpen, setReportOpen] = useState(false)
  const [reportWorkReady, setReportWorkReady] = useState(false)
  const reportWorkTimer = useRef<number | null>(null)
  const clearReportWorkTimer = useCallback(() => {
    if (reportWorkTimer.current == null) return
    window.clearTimeout(reportWorkTimer.current)
    reportWorkTimer.current = null
  }, [])
  const closeEvaluationReport = useCallback(() => {
    clearReportWorkTimer()
    setReportWorkReady(false)
    setReportOpen(false)
  }, [clearReportWorkTimer])
  const openEvaluationReport = useCallback(() => {
    clearReportWorkTimer()
    setReportWorkReady(false)
    setReportOpen(true)

    const reduceMotion = document.documentElement.classList.contains('reduce-animation')
      || document.documentElement.classList.contains('no-entrance-anim')
    if (reduceMotion) {
      setReportWorkReady(true)
      return
    }

    reportWorkTimer.current = window.setTimeout(() => {
      reportWorkTimer.current = null
      setReportWorkReady(true)
    }, REPORT_ASIDE_WORK_DELAY_MS)
  }, [clearReportWorkTimer])
  const actResId = useAppStore(selActResId)
  const scenarioLibrary = useAppStore((state) => state.combat)
  const showAllStates = useAppStore((state) => state.ui.preferences.showEvaluationStates)
  const themeMode = useAppStore((state) => state.ui.theme)
  const backgroundTextMode = useAppStore((state) => state.ui.backgroundTextMode)
  const isDarkTheme = themeMode === 'background' ? backgroundTextMode === 'dark' : themeMode === 'dark'
  const animatedPortraits = useAppStore((state) => state.ui.preferences.animatedRailPortraits)
  const optimizerRunning = useAppStore((state) => state.optimizer.status === 'running')
  const inventoryOpen = useAppStore((state) => state.invOpen)
  const { prepWork, actRt: runtime, partRtsById, actTgtSels } = useAppStore(selWorkDrvd)
  const updateScenarioRuntime = useAppStore((state) => state.updScenarioResRt)
  const setAnimatedPortraits = useAppStore((state) => state.setAnimatedRailPortraits)
  const selectedScenarioId = scenarioLibrary.selectedScenarioId
  const [reportTargetScenarioId, setReportTargetScenarioId] = useState(selectedScenarioId)
  const [railScenarioId, setRailScenarioId] = useState(selectedScenarioId)
  const [railPhase, setRailPhase] = useState<'idle' | 'out' | 'in'>('idle')
  const isShowcase = page === 'showcase'
  const isModulation = page === 'modulation'
  const isOptimizer = page === 'optimizer'
  const isSuggestions = page === 'suggestions'
  const pauseRailPortrait = isOptimizer && optimizerRunning

  const isNarrow = useMediaQuery('(max-width: 80rem)')
  const surfacePhase = 'idle' as const
  const analysisActive = surfacePhase === 'idle' && !inventoryOpen
  const [captureAction, setCaptureAction] = useState<'download' | 'clipboard' | null>(null)

  const railScenario = scenarioLibrary.scenariosById[railScenarioId] ?? null
  const railProjection = useMemo(() => {
    if (!railScenario) return null
    if (railScenarioId === selectedScenarioId && runtime) {
      return { subjectRuntime: runtime, runtimesById: partRtsById }
    }
    return projectScenarioUiRuntimes(railScenario)
  }, [partRtsById, railScenario, railScenarioId, runtime, selectedScenarioId])
  const railRuntime = railProjection?.subjectRuntime ?? null
  const railPartRtsById = railProjection?.runtimesById ?? EMPTY_RUNTIME_MAP
  const railResId = railRuntime?.id ?? null
  const railScenarioIdRef = useRef(selectedScenarioId)
  const boardRef = useRef<HTMLDivElement | null>(null)
  const mainStackRef = useRef<HTMLDivElement | null>(null)

  // Derive route context actions from the same canonical roster model used by chrome.
  const roster = useMemo<BuildRosterEntry[]>(
    () => makeRosterEntries(scenarioLibrary),
    [scenarioLibrary],
  )
  const rosterOps = useResonatorProfileOps(roster)

  const stageContextItems = useMemo(() => getEvaluationStageCtx({
    canDeleteAll: roster.length > 0,
    onPaste: () => {
      void rosterOps.paste()
    },
    onDeleteAll: () => {
      rosterOps.remove(roster.map((entry) => entry.id), {
        title: 'Remove all context resonators?',
        message: 'This will remove every scenario represented by the context roster. Build Lab will create a default fallback scenario.',
        successMessage: `Removed ${roster.length} context resonators from Build Lab.`,
      })
    },
  }), [roster, rosterOps])

  useEffect(() => {
    if (reportTargetScenarioId === railScenarioId || railPhase !== 'idle') {
      return undefined
    }

    return scheduleEvaluationTargetWork(() => {
      startTransition(() => {
        setReportTargetScenarioId(railScenarioId)
      })
    })
  }, [railPhase, railScenarioId, reportTargetScenarioId])

  const railSeed = railResId ? seedRsntById[railResId] ?? null : null

  // Modulation member inspection is local and does not mutate shared profile selection.
  const [progResId, setModulationMemberId] = useState<string | null>(null)
  const modulationRoster = useMemo<ResView[]>(() => {
    if (!railRuntime) return []

    const ids = [railRuntime.id, ...railRuntime.build.team.filter(Boolean)] as string[]
    return Array.from(new Set(ids)).flatMap((memberId) => {
      const view = getResonator(memberId)
      return view ? [view] : []
    })
  }, [railRuntime])
  const modulationMemberId = progResId && modulationRoster.some((mate) => mate.id === progResId)
    ? progResId
    : railResId
  const modulationRuntime = modulationMemberId ? railPartRtsById[modulationMemberId] ?? null : null
  const railTargets = useMemo(
    () => railScenarioId === selectedScenarioId
      ? actTgtSels
      : railScenario ? flattenScenarioRouting(railScenario) : {},
    [actTgtSels, railScenario, railScenarioId, selectedScenarioId],
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a scenario change invalidates the previous member selection.
    setModulationMemberId(null)
  }, [railScenarioId])

  // Resolve a pending member only after the requested scenario context becomes
  // active. The same resonator may belong to multiple scenario teams.
  const seatAsk = useImportLanding((state) => state.seatAsk)
  useEffect(() => {
    if (!isModulation || !seatAsk || railResId !== seatAsk.contextId) return
    if (!modulationRoster.some((mate) => mate.id === seatAsk.memberId)) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- consume the external import landing request in this workspace.
    setModulationMemberId(seatAsk.memberId)
    useImportLanding.getState().takeSeat()
  }, [isModulation, modulationRoster, railResId, seatAsk])

  useEffect(() => {
    useImportLanding.getState().setSeat(isModulation && railResId && modulationMemberId
      ? { contextId: railResId, memberId: modulationMemberId }
      : null)
  }, [isModulation, modulationMemberId, railResId])
  useEffect(() => () => useImportLanding.getState().setSeat(null), [])

  const updateModulationRuntime = useCallback((updater: (prev: ResRuntime) => ResRuntime) => {
    if (!modulationMemberId) return
    updateScenarioRuntime(railScenarioId, modulationMemberId, updater)
  }, [modulationMemberId, railScenarioId, updateScenarioRuntime])

  const updateRailRuntime = useCallback((
    resonatorId: string,
    updater: (prev: ResRuntime) => ResRuntime,
  ) => {
    updateScenarioRuntime(railScenarioId, resonatorId, updater)
  }, [railScenarioId, updateScenarioRuntime])

  const reportScenario = scenarioLibrary.scenariosById[reportTargetScenarioId] ?? null
  const reportProjection = useMemo(() => {
    if (!reportScenario) return null
    if (reportTargetScenarioId === selectedScenarioId && runtime) {
      return { subjectRuntime: runtime, runtimesById: partRtsById }
    }
    return projectScenarioUiRuntimes(reportScenario)
  }, [partRtsById, reportScenario, reportTargetScenarioId, runtime, selectedScenarioId])
  // Showcase owns its displayed member immediately; deferred report selection
  // must not hold back the stat sheet or its independent damage request.
  const reportRuntime = isShowcase ? railRuntime : reportProjection?.subjectRuntime ?? null
  const reportParticipants = isShowcase ? railPartRtsById : reportProjection?.runtimesById ?? EMPTY_RUNTIME_MAP
  const reportTargetResId = reportRuntime?.id ?? null
  const nextEvaluationInputs = useMemo(() => ({
    runtime: reportRuntime ? applyEvaluationAsm(reportRuntime) : null,
    runtimesById: applyEvaluationMapAsm(reportParticipants),
    targetSelections: isShowcase ? railTargets : reportTargetScenarioId === selectedScenarioId
      ? actTgtSels
      : reportScenario ? flattenScenarioRouting(reportScenario) : {},
  }), [
    actTgtSels,
    isShowcase,
    railTargets,
    reportParticipants,
    reportRuntime,
    reportScenario,
    reportTargetScenarioId,
    selectedScenarioId,
  ])
  // Live enemy and progression writes replace the scenario projection even
  // though evaluation policy ignores the enemy and maxes progression. Preserve
  // the normalized identity so those writes do not restart report rendering.
  const evaluationInputs = useStableEvaluationInputs(nextEvaluationInputs)
  const evaluationRuntime = evaluationInputs.runtime
  const evaluationReportRuntimesById = evaluationInputs.runtimesById
  const reportSeed = reportTargetResId ? seedRsntById[reportTargetResId] ?? null : null
  const evaluationTuneStrain = useMemo(
    () => getTuneStrainMaxForTeam(evaluationRuntime),
    [evaluationRuntime],
  )
  const evaluationEnemy = useMemo(
    () => makeEvaluationEnemy(evaluationTuneStrain),
    [evaluationTuneStrain],
  )
  const reportTargets = evaluationInputs.targetSelections
  const showcaseStats = useMemo(() => isShowcase && evaluationRuntime
    ? computeShowcaseStats({ runtime: evaluationRuntime, runtimesById: evaluationReportRuntimesById, enemy: evaluationEnemy, selectedTargets: reportTargets })
    : null, [evaluationEnemy, evaluationReportRuntimesById, evaluationRuntime, isShowcase, reportTargets])
  const reportTarget = useEvaluationTarget({
    targetRuntime: analysisActive && !isShowcase && !isSuggestions && !isOptimizer ? evaluationRuntime : null,
    targetSeed: analysisActive && !isShowcase && !isSuggestions && !isOptimizer ? reportSeed : null,
    targetSelections: isSuggestions ? EMPTY_TARGETS : reportTargets,
    // Evaluation scoring has its own normalized runtime/enemy assumptions, so
    // it must not reuse the live active prep even when evaluating the active resonator.
    activeResId: null,
    activeRuntimesById: isSuggestions ? EMPTY_RUNTIME_MAP : evaluationReportRuntimesById,
    initializedRuntimesById: isSuggestions ? EMPTY_RUNTIME_MAP : evaluationReportRuntimesById,
    enemy: evaluationEnemy,
    showAllStates: isSuggestions ? false : showAllStates,
    deferHeavyWork: true,
  })
  const showcaseInput = useMemo<ShowcaseAnalysisInput | null>(() => {
    if (!isShowcase || !evaluationRuntime || !railRuntime || !railScenario) return null
    const member = railScenario.team.members.find((entry) => entry.resonatorId === railRuntime.id)
    if (!member) return null
    const graph = railScenarioId === selectedScenarioId ? prepWork.combatGraph : null
    const participants = graph ? Object.values(graph.participants) : []
    return {
      scenarioId: railScenario.id, memberId: member.id,
      evaluation: { runtime: evaluationRuntime, runtimesById: evaluationReportRuntimesById, enemy: evaluationEnemy, selectedTargets: reportTargets },
      live: { runtime: railRuntime, runtimesById: railPartRtsById, enemy: railScenario.target, selectedTargets: railTargets,
        graph: graph ? {
          memberIdByResonatorId: Object.fromEntries(participants.map((entry) => [entry.resonatorId, entry.memberId])),
          targetsByRes: Object.fromEntries(participants.map((entry) => [entry.resonatorId, entry.slot.routing.selectedTargetsByOwnerKey])),
          environmentBuffsByMemberId: graph.environmentBuffsByMemberId,
          environmentTargetModifiers: graph.environmentTargetModifiers,
        } : undefined,
      },
      setConds: member.local.setConditionals,
    }
  }, [evaluationEnemy, evaluationReportRuntimesById, evaluationRuntime, isShowcase, railPartRtsById, railRuntime, railScenario, railScenarioId, railTargets, reportTargets, prepWork.combatGraph, selectedScenarioId])
  const showcaseAnalysis = useShowcaseAnalysis(showcaseInput, analysisActive)
  const reportRuntimesById = reportTarget.runtimesById
  const simulation = reportTarget.simulation
  const reportStateGroups = reportTarget.stateGroups
  const echoRuntime = isModulation ? modulationRuntime ?? railRuntime : railRuntime
  const echoSeed = (isModulation && echoRuntime ? seedRsntById[echoRuntime.id] ?? null : null)
    ?? railSeed
  const echoLoadout = echoRuntime?.build.echoes ?? EMPTY_ECHO_LOADOUT
  const echoScoringWork = useMemo(() => {
    if (isShowcase || !echoRuntime || !echoSeed || !railScenario) return null
    if (echoRuntime.id === railRuntime?.id && railScenarioId === selectedScenarioId) {
      return prepWork
    }
    return mkPrepWork({
      revision: railScenario.revision,
      runtime: echoRuntime,
      seed: echoSeed,
      enemy: railScenario.target,
      prtcRntmById: railPartRtsById,
      activeTarget: railTargets,
      combatGraph: railScenarioId === selectedScenarioId ? prepWork.combatGraph : null,
    })
  }, [
    isShowcase,
    echoRuntime,
    echoSeed,
    prepWork,
    railPartRtsById,
    railRuntime?.id,
    railScenario,
    railScenarioId,
    railTargets,
    selectedScenarioId,
  ])
  const { simulation: echoScoringSimulation, ready: echoScoringSimulationReady } =
    useSettledLiveRun(echoScoringWork, `${railScenarioId}:${echoRuntime?.id ?? ''}`)
  const modulationAnalysisSource = useMemo<MemberAnalysisSource | null>(() => (
    railScenario && railRuntime
      ? {
          scenario: railScenario,
          subjectRuntime: railRuntime,
          runtimesById: railPartRtsById,
          selectedTargets: railTargets,
          workspace: echoScoringWork,
          simulation: echoScoringSimulation,
        }
      : null
  ), [
    echoScoringSimulation,
    echoScoringWork,
    railPartRtsById,
    railRuntime,
    railScenario,
    railTargets,
  ])

  const loadoutSlots = useMemo(
    () => echoLoadout.map((echo) => (echo ? makeEchoSlot(echo) : null)),
    [echoLoadout],
  )
  // a resonator with no substat weights has nothing to score against, so the
  // slots fall back to the crit value they rolled
  const echoScores = useEchoScores(isShowcase ? null : echoRuntime?.id, echoLoadout)
  const equipEvaluationEcho = useCallback((echo: EchoInstance, slotIndex: number) => {
    const resonatorId = echoRuntime?.id
    if (!resonatorId) return

    updateRailRuntime(resonatorId, (curRt) => ({
      ...curRt,
      build: {
        ...curRt.build,
        echoes: qpEchoAtSlot(curRt.build.echoes, echo, slotIndex),
      },
    }))
  }, [echoRuntime?.id, updateRailRuntime])
  // the head writes the loadout whole (forge, save all, unequip all) through the
  // same runtime the slots do, so progression lands on the member being tuned
  const setEchoLoadout = useCallback((echoes: Array<EchoInstance | null>) => {
    const resonatorId = echoRuntime?.id
    if (!resonatorId) return

    updateRailRuntime(resonatorId, (curRt) => ({
      ...curRt,
      build: { ...curRt.build, echoes },
    }))
  }, [echoRuntime?.id, updateRailRuntime])

  const openEchoSlot = useCallback((slotIndex: number) => {
    const resonatorId = echoRuntime?.id
    if (!resonatorId) return
    openEchoCnsl(resonatorId, slotIndex, railScenarioId)
  }, [echoRuntime?.id, railScenarioId])

  const echoSurfaceMenu = useEchoSrfcM({
    clpbSrcResId: echoRuntime?.id ?? 'unknown',
    clipSourceName: echoSeed?.name ?? echoRuntime?.id ?? 'No Resonator',
    currentEchoes: echoLoadout,
    onQpEchoAtjg: equipEvaluationEcho,
  })
  const { buildReadOnlyMenu, canSaveEcho, copyEchoesToClipboard } = echoSurfaceMenu
  const evaluationEchoItems = useMemo(
    () => echoLoadout
      .map((echo, index) => (echo ? { id: `evaluation:${echoRuntime?.id ?? 'unknown'}:echo:${index}`, val: echo } : null))
      .filter((item): item is { id: string; val: EchoInstance } => Boolean(item)),
    [echoLoadout, echoRuntime?.id],
  )
  const evaluationEchoActions = useMemo(() => [{
    id: 'evaluation-echo:copy',
    key: 'copy' as const,
    needsSel: true,
    icon: <Copy size="1em" />,
    label: ({ count }: { count: number }) => `Copy (${count})`,
    title: 'Copy selected echoes (Ctrl/Cmd+C)',
    run: async ({ vals }: { vals: EchoInstance[] }) => {
      const wrote = await copyEchoesToClipboard(vals)
      if (wrote) {
        showToast({
          content: `Copied ${vals.length} echo${vals.length === 1 ? '' : 'es'}.`,
          variant: 'success',
          duration: 2200,
        })
      }
    },
  }], [copyEchoesToClipboard, showToast])
  const evaluationEchoSelection = useSel({
    surfaceId: `evaluation:${echoRuntime?.id ?? 'unknown'}:echoes`,
    ariaLabel: 'Evaluation echo selection actions',
    noun: { one: 'echo', many: 'echoes' },
    items: evaluationEchoItems,
    acts: evaluationEchoActions,
    active: captureAction == null && surfacePhase === 'idle',
  })
  const focusEvaluationEchoSurface = evaluationEchoSelection.focusSurface
  const addEvaluationEchoToSelection = evaluationEchoSelection.addToSelection
  const getEvaluationEchoId = useCallback(
    (slotIndex: number) => `evaluation:${echoRuntime?.id ?? 'unknown'}:echo:${slotIndex}`,
    [echoRuntime?.id],
  )
  const getEvaluationEchoItems = useCallback((itemId: string, echo: EchoInstance) => (
    buildReadOnlyMenu({
      id: itemId,
      echo,
      onSelect: () => {
        focusEvaluationEchoSurface()
        addEvaluationEchoToSelection(itemId)
      },
    })
  ), [addEvaluationEchoToSelection, buildReadOnlyMenu, focusEvaluationEchoSurface])
  const echoSelection = useMemo<EvaluationEchoSelection>(() => ({
    selectionMode: evaluationEchoSelection.selectionMode,
    isSelected: evaluationEchoSelection.isSelected,
    buildClickCapture: evaluationEchoSelection.buildClickCapture,
    getId: getEvaluationEchoId,
    getItems: getEvaluationEchoItems,
    surfaceProps: evaluationEchoSelection.surfaceProps,
  }), [
    evaluationEchoSelection.buildClickCapture,
    evaluationEchoSelection.isSelected,
    evaluationEchoSelection.selectionMode,
    evaluationEchoSelection.surfaceProps,
    getEvaluationEchoId,
    getEvaluationEchoItems,
  ])

  const echoActions = useWorkspaceEchoActions({
    resonatorId: echoRuntime?.id,
    echoLoadout,
    editable: true,
    canSaveEcho,
    onEchoLoadoutChange: setEchoLoadout,
  })

  // Modulation requests target snapshots for its summary and defers feature and
  // upgrade sections until detail is requested. Other consumers retain score only.
  const reportOptions = isModulation
    ? MODULATION_SUMMARY_REPORT_OPTIONS
    : SCORE_ONLY_EVALUATION_REPORT_OPTIONS

  const { report, loading, error } = useEvaluationReport({
    runtime: evaluationRuntime,
    simulation,
    enemy: evaluationEnemy,
    runtimesById: reportRuntimesById,
    enabled: analysisActive && !isShowcase && !isSuggestions && !isOptimizer,
    clearOnDisable: isShowcase || isSuggestions || isOptimizer,
    identityKey: reportTargetScenarioId,
    reportOptions,
  })

  const { report: detailReport, loading: detailReportLoading } = useEvaluationReport({
    runtime: evaluationRuntime,
    simulation,
    enemy: evaluationEnemy,
    runtimesById: reportRuntimesById,
    enabled: analysisActive && isModulation && reportOpen && reportWorkReady,
    identityKey: reportTargetScenarioId,
    reportOptions: FULL_EVALUATION_REPORT_OPTIONS,
    cacheResult: false,
    clearOnDisable: true,
  })
  const optimizerSummary = useEvaluationSummary({
    runtime: evaluationRuntime, enemy: evaluationEnemy,
    runtimesById: evaluationReportRuntimesById,
    identityKey: reportTargetScenarioId,
    enabled: analysisActive && isOptimizer,
  })
  const suggestionsPercent = useSuggestionsRailScore({
    runtime: evaluationRuntime,
    enemy: evaluationEnemy,
    runtimesById: evaluationReportRuntimesById,
    identityKey: reportTargetScenarioId,
    enabled: analysisActive && isSuggestions,
  })

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- cancel the old scenario report at the ownership boundary.
    closeEvaluationReport()
  }, [closeEvaluationReport, reportTargetScenarioId, evaluationRuntime?.id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opening Inventory cancels the report drawer and its deferred work.
    if (inventoryOpen) closeEvaluationReport()
  }, [closeEvaluationReport, inventoryOpen])

  useEffect(() => clearReportWorkTimer, [clearReportWorkTimer])

  useEffect(() => {
    if (!analysisActive || !echoScoringSimulationReady || !echoRuntime || !echoSeed || !railScenario || !echoScoringSimulation) {
      return undefined
    }
    const member = railScenario.team.members.find((entry) => entry.resonatorId === echoRuntime.id)
    if (!member) return undefined

    const input = {
      scenarioId: railScenario.id,
      memberId: member.id,
      runtime: echoRuntime,
      seed: echoSeed,
      enemy: railScenario.target,
      runtimesById: railPartRtsById,
      selectedTargets: railTargets,
      setConds: member.local.setConditionals,
      simulation: echoScoringSimulation,
    }
    const reportMatchesEcho = reportTargetScenarioId === railScenarioId
      && evaluationRuntime?.id === echoRuntime.id

    if (reportMatchesEcho) {
      if (!report || cacheEchoMainStatScoringFromEvaluation(input, report)) {
        return undefined
      }
    }

    const timer = window.setTimeout(() => {
      void prepareEchoMainStatScoring(input).catch((nextError) => {
        console.error('Failed to prepare Echo main-stat scoring.', nextError)
      })
    }, 320)

    return () => window.clearTimeout(timer)
  }, [
    analysisActive,
    echoScoringSimulationReady,
    echoRuntime,
    echoScoringSimulation,
    echoSeed,
    evaluationRuntime?.id,
    railPartRtsById,
    railScenario,
    railScenarioId,
    railTargets,
    report,
    reportTargetScenarioId,
  ])

  const overviewStatsTree = useMemo(
    () => !isShowcase && simulation?.finalStats ? makeStatsTree(simulation.finalStats) : [],
    [isShowcase, simulation],
  )

  useLayoutEffect(() => {
    if (isShowcase) return undefined
    const board = boardRef.current
    const stack = mainStackRef.current
    if (!board || !stack) return undefined

    let frame = 0
    const updateInset = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        stack.style.setProperty('--workspace-stack-stick-top', `${board.clientHeight - stack.offsetHeight}px`)
      })
    }
    const observer = new ResizeObserver(updateInset)
    observer.observe(board)
    observer.observe(stack)
    updateInset()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [isShowcase, report])

  const accent = railSeed ? ATTR_COLORS[railSeed.attribute] ?? '#6b7cff' : '#6b7cff'
  const dockResId = isModulation ? modulationMemberId : railResId
  const dockRuntime = isModulation ? modulationRuntime : railRuntime
  const dockMember = isModulation
    ? modulationRoster.find((member) => member.id === modulationMemberId) ?? null
    : null
  const dockAccent = dockMember ? ATTR_COLORS[dockMember.attribute] ?? accent : accent
  const reportMatchesRail = reportTargetScenarioId === railScenarioId
  // Keep completed readings visible while this scenario is being reevaluated.
  // A cache hit retains the same report; a fresh result replaces it together.
  const visibleReport = reportMatchesRail ? report : null
  const score = isShowcase ? (showcaseAnalysis?.percent != null ? showcaseAnalysis.percent * 100 : null)
    : isOptimizer ? (optimizerSummary?.percent != null && reportMatchesRail ? optimizerSummary.percent * 100 : null)
    : isSuggestions ? (suggestionsPercent != null && reportMatchesRail ? suggestionsPercent * 100 : null)
      : visibleReport ? visibleReport.evaluation.percent * 100 : null
  const showcaseAvgDamage = isShowcase
    ? showcaseAnalysis?.userDamage ?? null
    : null
  const grade = getBuildEvaluationGrade(score)
  const tone = score != null ? getBuildEvaluationTone(score).color : accent

  const activeBuild: EvaluationBuildSnapshot | null = visibleReport?.evaluation.builds.active ?? null
  const referenceBuild: EvaluationBuildSnapshot | null = visibleReport?.evaluation.builds.referenceBuild ?? null
  const maximumBuild: EvaluationBuildSnapshot | null = visibleReport?.evaluation.builds.maximumBuild ?? null

  const showcaseBuild = useMemo(() => {
    if (!isShowcase || !railRuntime) return null
    const buildSeed = seedRsntById[railRuntime.id] ?? null
    const buildStats = buildSeed ? getBuildStats(railRuntime, resResBaseSt(buildSeed, railRuntime.base.level)) : null
    const buildStatsView = buildStats ? makeStatsView(railRuntime, buildStats) : null
    const finalStats = isShowcase ? showcaseStats : simulation?.finalStats
    const combatStatsView =
      evaluationRuntime?.id === railRuntime.id && finalStats
        ? makeStatsView(evaluationRuntime, finalStats)
        : null
    return {
      combatStatsView,
      buildStatsView,
      charId: railRuntime.id,
      hasWeights: getMaxEchoSc(railRuntime.id) > 0,
      echoes: railRuntime.build.echoes,
      sonataSets: buildSonataPlan(railRuntime.build.echoes).map((entry) => ({
        setId: entry.id,
        pieces: entry.count,
        icon: entry.icon,
        name: getSntSetNam(entry.id),
      })),
    }
  }, [evaluationRuntime, isShowcase, railRuntime, showcaseStats, simulation])

  const railModel = useMemo<BuildRailModel>(() => buildRailModel(railResId, {
    actResId: railResId,
    runtime: railRuntime,
    partRtsById: railPartRtsById,
    initRtsById: railPartRtsById,
  }), [railPartRtsById, railResId, railRuntime])

  const incomingRailModel = useMemo(() => buildRailModel(actResId, {
    actResId,
    runtime,
    partRtsById,
    initRtsById: partRtsById,
  }), [actResId, partRtsById, runtime])
  const incomingRailAssetUrls = useMemo(() => {
    return [
      { src: incomingRailModel.portraitSrc, selector: '.workspace-portrait-img' },
      { src: incomingRailModel.attrIcon, selector: '.workspace-portrait-elem, .seal-id-attr' },
      { src: incomingRailModel.weaponIcon, selector: '.workspace-weapon-icon, .seal-bloom-gun' },
    ].filter((asset): asset is { src: string; selector: string } => Boolean(asset.src))
  }, [incomingRailModel])

  useEffect(() => {
    railScenarioIdRef.current = railScenarioId
  }, [railScenarioId])

  useEffect(() => {
    if (selectedScenarioId === railScenarioIdRef.current) {
      return undefined
    }

    let canceled = false

    const commitRail = () => {
      if (canceled) return
      railScenarioIdRef.current = selectedScenarioId
      setRailScenarioId(selectedScenarioId)
      setRailPhase('in')
    }

    if (typeof window === 'undefined') {
      commitRail()
      return undefined
    }

    const phaseHandle = window.setTimeout(() => {
      setRailPhase('out')
    }, 0)
    const exitHandle = window.setTimeout(() => {
      const assets = incomingRailAssetUrls.map(({ src, selector }) => ({
        src, width: boardRef.current?.querySelector(selector)?.getBoundingClientRect().width ?? 0,
      }))
      void preloadEvaluationRailImages(assets).then(commitRail)
    }, EVALUATION_RAIL_EXIT_MS)

    return () => {
      canceled = true
      window.clearTimeout(phaseHandle)
      window.clearTimeout(exitHandle)
    }
  }, [incomingRailAssetUrls, selectedScenarioId])

  useEffect(() => {
    if (railPhase !== 'in' || typeof window === 'undefined') {
      return undefined
    }
    const handle = window.setTimeout(() => {
      setRailPhase('idle')
    }, EVALUATION_RAIL_ENTER_MS)
    return () => window.clearTimeout(handle)
  }, [railPhase, railScenarioId])

  const evaluationBanner = !isShowcase && isNarrow ? (
    <NarrowEvaluationBanner
      portraitSrc={railModel.portraitSrc}
      spriteCss={railModel.spriteCss}
      backdropSrc={railModel.portraitSrc}
    />
  ) : null

  return (
    <>
      <div className="simulation-stage">
      <div className={`simulation-workspace${isOptimizer ? ' opt-lab' : ''}${isSuggestions ? ' sgl-lab' : ''}`} style={{ '--resonator-accent': accent, '--grade': tone } as CssVars}>
        {!isShowcase && error ? <div className="workspace-notice workspace-notice--error">{error.message}</div> : null}

        {runtime ? (
            <BuildWorkspacePresentation
              boardRef={boardRef} page={page} isDarkTheme={isDarkTheme}
              stageContextItems={stageContextItems} onCaptureChange={setCaptureAction}
              railProps={{ isShowcase, railPhase, railResId, scenarioId: railScenarioId, railModel,
                animatedPortraits: animatedPortraits && !pauseRailPortrait,
                onAnimatedPortraitsChange: pauseRailPortrait ? undefined : setAnimatedPortraits,
                editable: true, onRuntimeUpdate: updateRailRuntime, surfacePhase,
                score, grade, tone, showcaseBuild, showcaseAvgDamage,
                onEchoOpen: openEchoSlot, echoSelection,
              }}
              dockProps={{ resId: dockResId, runtime: dockRuntime, scenarioId: railScenarioId, page, accent: dockAccent, onRuntimeUpdate: updateRailRuntime }}
            >

              {isOptimizer ? (
                <Suspense fallback={(
                  <AppLdrVrly
                    mode="centered" className="app-loader-fallback--route"
                    text="Loading optimizer..."
                  />
                )}>
                  <EvaluationSummaryContext value={optimizerSummary}><EmbeddedOptimizer variant="embedded" /></EvaluationSummaryContext>
                </Suspense>
              ) : null}

              {isSuggestions ? (
                <Suspense fallback={(
                  <AppLdrVrly
                    mode="centered" className="app-loader-fallback--route"
                    text="Loading suggestions..."
                  />
                )}>
                  <EmbeddedSuggestions />
                </Suspense>
              ) : null}

              {!isOptimizer && !isSuggestions && !isShowcase ? (
                <ModulationReport
                  phase={surfacePhase}
                  modulation={isModulation}
                  modulationRuntime={modulationRuntime}
                  modulationActRt={railRuntime}
                  modulationAnalysisSource={modulationAnalysisSource}
                  modulationRoster={modulationRoster}
                  modulationMemberId={modulationMemberId}
                  onModulationMember={setModulationMemberId}
                  modulationDark={isDarkTheme}
                  onModulationUpdate={updateModulationRuntime}
                  loading={loading || !reportMatchesRail}
                  report={visibleReport}
                  detailReport={reportWorkReady ? detailReport : null}
                  detailReportReady={reportWorkReady}
                  detailReportLoading={detailReportLoading}
                  reportOpen={reportOpen}
                  onReportOpen={openEvaluationReport}
                  onReportClose={closeEvaluationReport}
                  activeBuild={activeBuild}
                  referenceBuild={referenceBuild}
                  maximumBuild={maximumBuild}
                  score={score}
                  grade={grade}
                  tone={tone}
                  banner={evaluationBanner}
                  detailBuildKey={detailBuildKey}
                  setDetailBuildKey={setDetailBuildKey}
                  mainStackRef={mainStackRef}
                  stateGroups={reportStateGroups}
                  reportRuntime={evaluationRuntime}
                  reportRuntimesById={reportRuntimesById}
                  enemyId={evaluationEnemy.id}
                  echoSelection={echoSelection}
                  echoActions={echoActions}
                  echoScores={echoScores}
                  loadoutSlots={loadoutSlots}
                  sourceEchoes={echoLoadout}
                  onEchoOpen={openEchoSlot}
                  overviewStatsTree={overviewStatsTree}
                  echoRuntime={echoRuntime}
                  echoScenarioId={railScenarioId}
                  echoResonatorName={echoSeed?.name}
                  echoEditable
                  canSaveEcho={canSaveEcho}
                  onEchoLoadout={setEchoLoadout}
                />
              ) : null}
            </BuildWorkspacePresentation>
        ) : null}
      </div>
      </div>
      <ConfirmHost control={confirmation} portalTarget={portalTarget} />
    </>
  )
}
