/*
  Author: Runor Ewhro
  Description: Handles persisted app-state loading, validation, granular
               domain writes, and recovery cleanup.
*/

import { DEF_UI_PREFS } from '@/domain/entities/preferences'
import { SHOWCASE_INDEX, readShowcaseCards, writeShowcaseCards, clearShowcaseCards } from './showcaseCards'
import type { HydratedAppState, PersistedState } from '@/domain/entities/appState'
import type { PersistedUnknown } from '@/engine/runtime/defaults'
import { makeScenarioTeam, type CombatScenario, type CombatScenarioId } from '@/domain/entities/combatScenario'
import { copyScenarioRecords, summarizeScenario, type ScenarioSummary, type ScenarioWorkspace } from '@/domain/entities/scenarioLibrary'
import { makeAppState, initAppState, normalizeStoredCombatScenario } from '@/engine/runtime/defaults'
import { isRotationSequence } from '@/domain/gameData/rotationSequence.ts'
import { contextScenarioMember } from '@/domain/entities/combatScenario.ts'
import { compressToUTF16, decompressFromUTF16 } from 'lz-string'
import { readStoredScenarioIds } from './resonatorScope'
import {
  APP_STATE_VER,
  persistedSchema,
  prssInvBldsS,
  prssInvChsSl,
  prssInvRttnS,
  prssInvScenariosSl,
  prssOptSettingsSl,
  prssCmbtWrkspSlcS,
  prssSuggsSlc,
  prssUiPprnSl,
  prssUiLytSlc,
  prssUiSvdRoh,
  parseCombatScenario,
  parseScenarioMember,
  parseScenarioTarget,
  parseScenarioEnvironment,
  parseScenarioProgram,
  parseDormantScenarioMembers,
} from '@/engine/runtime/schema'

import {
  APP_STORAGE_KEY,
  APPSTOREUIPP,
  APPSTOREUILY,
  APPSTOREUISV,
  APPSTORECMBT,
  APPSTORECMBTINDEX,
  APPSTORECMBTREC,
  APPSTOREPRFL,
  APPSTOREOPTS,
  SUGG_STORE_KEY,
  APPSTOREINVC,
  APPSTOREINVB,
  APPSTOREINVR,
  APPSTOREINVS,
  APPSTORERCVR,
  RETIRED_SESSION_STORE_KEY,
} from './storageKeys'
export {
  APP_STORAGE_KEY,
  APPSTOREUIPP,
  APPSTOREUILY,
  APPSTOREUISV,
  APPSTORECMBT,
  APPSTORECMBTINDEX,
  APPSTOREPRFL,
  APPSTOREOPTS,
  SUGG_STORE_KEY,
  APPSTOREINVC,
  APPSTOREINVB,
  APPSTOREINVR,
  APPSTOREINVS,
  APPSTORERCVR,
} from './storageKeys'

const LEGACY_STORAGE_VERSIONS = [26, 25, 24, 23, 22] as const
const COMPRESSED_ROTATIONS_PREFIX = 'wwcalc-lz1:'

export type PersistKey =
  | 'ui.appearance'
  | 'ui.layout'
  | 'ui.showcaseCards'
  | 'ui.savedRotationPreferences'
  | 'combat.workspace'
  | 'simulation.optimizerSettings'
  | 'simulation.suggestions'
  | 'library.echoes'
  | 'library.builds'
  | 'library.rotations'
  | 'library.scenarios'

const NONINVDMNKEY: PersistKey[] = [
  'ui.appearance',
  'ui.layout',
  'ui.showcaseCards',
  'ui.savedRotationPreferences',
  'combat.workspace',
  'simulation.optimizerSettings',
  'simulation.suggestions',
]

const GEAR_DOMAIN_KEYS: PersistKey[] = ['library.echoes', 'library.builds']
const SAVED_ROTATION_DOMAIN_KEYS: PersistKey[] = ['library.rotations', 'library.scenarios']
const INV_DOMAIN_KEYS: PersistKey[] = [...GEAR_DOMAIN_KEYS, ...SAVED_ROTATION_DOMAIN_KEYS]

export const ALL_DOMAIN_KEYS: PersistKey[] = [
  ...NONINVDMNKEY,
  ...INV_DOMAIN_KEYS,
]

type PersistDraft = PersistedUnknown
type PrssDmnSchm = {
  safeParse: (value: unknown) =>
    | { success: true; data: unknown }
    | { success: false; error?: unknown }
}

interface PersistSpec<TSlice> {
  label: string
  storageKey: string
  schema: PrssDmnSchm
  build: (state: PersistedState) => TSlice
  apply: (state: PersistDraft, slice: TSlice) => void
}

const pndnPrssDmns = new Set<PersistKey>()
const pndnPrssDmnL = new Set<() => void>()
let combatRecordSerial = 0
let lastCombatManifest: string | null = null
const lastSavedCombatRefs = new Map<string, CombatScenario>()
let combatCleanupTimer: ReturnType<typeof setTimeout> | null = null

interface CombatStorageIndex {
  version: number
  selectedScenarioId: CombatScenarioId
  order: CombatScenarioId[]
  recordsById: Record<string, string>
  summaryById?: Record<string, ScenarioSummary>
  resonatorIdsById?: Record<string, string[]>
}

interface ScenarioRecordManifest {
  format: 2
  id: CombatScenarioId
  revision: number
  contextMemberId: CombatScenario['contextMemberId']
  initialOnFieldMemberId: CombatScenario['initialOnFieldMemberId']
  team: string[]
  memberIds: string[]
  memberRecords: Record<string, string>
  targetRecord: string
  environmentRecord: string
  programRecord: string
  dormantRecord?: string
}

function decodeCombatRecord(key: string): unknown {
  const record = localStorage.getItem(key)
  if (!record) throw new Error(`Missing combat scenario record: ${key}`)
  const json = record.startsWith(COMPRESSED_ROTATIONS_PREFIX)
    ? decompressFromUTF16(record.slice(COMPRESSED_ROTATIONS_PREFIX.length))
    : record
  if (!json) throw new Error(`Unreadable combat scenario record: ${key}`)
  return JSON.parse(json)
}

function scenarioManifest(key: string): ScenarioRecordManifest | null {
  const value = decodeCombatRecord(key) as Partial<ScenarioRecordManifest> | null
  if (!value || value.format !== 2) return null
  if (!Array.isArray(value.memberIds) || !value.memberRecords
    || !value.targetRecord || !value.environmentRecord || !value.programRecord) {
    throw new Error(`Invalid combat scenario manifest: ${key}`)
  }
  return value as ScenarioRecordManifest
}

function writeCombatRecord(id: string, part: string, value: unknown, created: string[]): string {
  const key = `${APPSTORECMBTREC}${encodeURIComponent(id)}.${Date.now().toString(36)}.${combatRecordSerial++}.${part}`
  const json = JSON.stringify(value)
  localStorage.setItem(key, json.length < 1024 ? json : `${COMPRESSED_ROTATIONS_PREFIX}${compressToUTF16(json)}`)
  created.push(key)
  return key
}

function parseCombatStorageIndex(raw: string): CombatStorageIndex {
  const index = JSON.parse(raw) as CombatStorageIndex
  if (index?.version !== APP_STATE_VER
    || typeof index.selectedScenarioId !== 'string'
    || !Array.isArray(index.order)
    || !index.recordsById
    || typeof index.recordsById !== 'object'
    || index.order.length === 0
    || new Set(index.order).size !== index.order.length
    || !index.order.includes(index.selectedScenarioId)
    || Object.keys(index.recordsById).length !== index.order.length
    || (index.summaryById != null && (
      Object.keys(index.summaryById).length !== index.order.length
      || index.order.some((id) => {
        const summary = index.summaryById?.[id]
        return !summary
          || typeof summary.resonatorId !== 'string'
          || !Number.isFinite(summary.level)
          || !Number.isFinite(summary.sequence)
          || !Number.isFinite(summary.rotationNodes)
      })
    ))
    || (index.resonatorIdsById != null && (
      Object.keys(index.resonatorIdsById).length !== index.order.length
      || index.order.some((id) => !Array.isArray(index.resonatorIdsById?.[id])
        || index.resonatorIdsById![id].some((resonatorId) => typeof resonatorId !== 'string'))
    ))
    || index.order.some((id) => typeof id !== 'string'
      || typeof index.recordsById[id] !== 'string'
      || !index.recordsById[id].startsWith(APPSTORECMBTREC))) {
    throw new Error('Combat workspace index is invalid.')
  }
  return index
}

function scheduleCombatRecordCleanup(): void {
  if (combatCleanupTimer !== null) clearTimeout(combatCleanupTimer)
  combatCleanupTimer = setTimeout(() => {
    combatCleanupTimer = null
    const raw = localStorage.getItem(APPSTORECMBTINDEX)
    if (!raw) return
    let index: CombatStorageIndex
    try { index = parseCombatStorageIndex(raw) } catch { return }
    const liveRecords = new Set(Object.values(index.recordsById))
    try {
      for (const key of Object.values(index.recordsById)) {
        const manifest = scenarioManifest(key)
        if (!manifest) continue
        for (const section of [manifest.targetRecord, manifest.environmentRecord, manifest.programRecord,
          manifest.dormantRecord, ...Object.values(manifest.memberRecords)]) {
          if (section) liveRecords.add(section)
        }
      }
    } catch { return }
    for (let cursor = localStorage.length - 1; cursor >= 0; cursor -= 1) {
      const key = localStorage.key(cursor)
      if (key?.startsWith(APPSTORECMBTREC) && !liveRecords.has(key)) localStorage.removeItem(key)
    }
  }, 5_000)
  ;(combatCleanupTimer as unknown as { unref?: () => void }).unref?.()
}

type StoredScenarioGetter = (() => CombatScenario) & { recordKey?: string }

function readScenarioRecord(id: string, recordKey: string): CombatScenario {
  const record = decodeCombatRecord(recordKey) as Partial<ScenarioRecordManifest> & { id?: unknown }
  const parsed = record?.format === 2
    ? {
      id: record.id,
      revision: record.revision,
      contextMemberId: record.contextMemberId,
      initialOnFieldMemberId: record.initialOnFieldMemberId,
      team: { members: record.memberIds!.map((memberId) => decodeCombatRecord(record.memberRecords![memberId])) },
      target: decodeCombatRecord(record.targetRecord!),
      environment: decodeCombatRecord(record.environmentRecord!),
      program: decodeCombatRecord(record.programRecord!),
      ...(record.dormantRecord ? { dormantMembersByResonatorId: decodeCombatRecord(record.dormantRecord) } : {}),
    }
    : record
  if (!parsed || parsed.id !== id) throw new Error(`Invalid combat scenario record: ${id}`)
  const result = parseCombatScenario(parsed)
  if (!result.success) throw new Error(`Invalid combat scenario record: ${id}`)
  // Normalize one record when it is actually read; this restores catalog
  // derived weapon fields without expanding every saved scenario at startup.
  return normalizeStoredCombatScenario(result.data as unknown as CombatScenario)
}

function makeLazyScenarioRecords(index: CombatStorageIndex): Record<string, CombatScenario> {
  const records: Record<string, CombatScenario> = {}
  for (const id of index.order) {
    const key = index.recordsById[id]
    let cached: CombatScenario | null = null
    const get = (() => {
      cached ??= readScenarioRecord(id, key)
      return cached
    }) as StoredScenarioGetter
    get.recordKey = key
    Object.defineProperty(records, id, { enumerable: true, configurable: true, get })
  }
  return records
}

function readCombatWorkspace(): ReturnType<typeof makeCombatWorkspace> | null {
  const raw = localStorage.getItem(APPSTORECMBTINDEX)
  if (!raw) return null
  try {
    const index = parseCombatStorageIndex(raw)
    if (!index.summaryById) {
      // Migrate an older index one record at a time. A complete workspace
      // validation used to hold all decoded scenarios at once during startup.
      index.summaryById = Object.fromEntries(index.order.map((id) => [
        id, summarizeScenario(readScenarioRecord(id, index.recordsById[id])),
      ]))
      const upgraded = JSON.stringify(index)
      try {
        localStorage.setItem(APPSTORECMBTINDEX, upgraded)
        lastCombatManifest = upgraded
      } catch {
        lastCombatManifest = raw
      }
    } else {
      lastCombatManifest = raw
    }
    const records = makeLazyScenarioRecords(index)
    // Validate the selected record eagerly. Other records are parsed only
    // when their scenario is selected, copied, or exported.
    const selectedScenario = records[index.selectedScenarioId]
    lastSavedCombatRefs.clear()
    lastSavedCombatRefs.set(index.selectedScenarioId, selectedScenario)
    scheduleCombatRecordCleanup()
    return {
      version: APP_STATE_VER,
      combat: {
        selectedScenarioId: index.selectedScenarioId,
        order: index.order,
        scenariosById: records,
        summaryById: index.summaryById,
      },
    } as ReturnType<typeof makeCombatWorkspace>
  } catch (error) {
    console.warn('[storage] failed to load scenario records', error)
    lastCombatManifest = null
    lastSavedCombatRefs.clear()
    return null
  }
}

function validateScenarioForWrite(
  id: CombatScenarioId,
  scenario: CombatScenario,
  previous: CombatScenario | undefined,
  previousManifest: ScenarioRecordManifest | null,
): CombatScenario {
  const fullParse = () => {
    const parsed = parseCombatScenario(scenario)
    if (!parsed.success || parsed.data.id !== id) throw new Error(`Refusing to save invalid combat scenario: ${id}`)
    return parsed.data as unknown as CombatScenario
  }
  if (!previous || !previousManifest) return fullParse()

  // This path only trusts section references that were validated at the last
  // successful manifest commit. New sections still go through their schemas.
  const allowed = new Set(['id', 'revision', 'team', 'contextMemberId', 'initialOnFieldMemberId',
    'dormantMembersByResonatorId', 'target', 'environment', 'program'])
  const members = scenario.team?.members
  if (scenario.id !== id || !Number.isInteger(scenario.revision) || scenario.revision < 0
    || Object.keys(scenario).some((key) => !allowed.has(key))
    || Object.keys(scenario.team ?? {}).some((key) => key !== 'members')
    || !Array.isArray(members) || members.length < 1 || members.length > 3) {
    throw new Error(`Refusing to save invalid combat scenario: ${id}`)
  }
  const requireValid = <T>(result: { success: boolean; data?: unknown }, label: string): T => {
    if (!result.success) throw new Error(`Refusing to save invalid ${label} in combat scenario: ${id}`)
    return result.data as T
  }
  const validatedMembers = members.map((member) => {
    const old = previous.team.members.find((candidate) => candidate.id === member.id)
    return old === member ? member
      : requireValid<CombatScenario['team']['members'][number]>(parseScenarioMember(member), 'member')
  })
  const memberIds = new Set<string>(validatedMembers.map((member) => member.id))
  const resonatorIds = new Set(validatedMembers.map((member) => member.resonatorId))
  if (memberIds.size !== validatedMembers.length || resonatorIds.size !== validatedMembers.length
    || !memberIds.has(scenario.contextMemberId) || !memberIds.has(scenario.initialOnFieldMemberId)) {
    throw new Error(`Refusing to save invalid combat scenario members: ${id}`)
  }
  const environment = previous.environment === scenario.environment ? scenario.environment
    : requireValid<CombatScenario['environment']>(parseScenarioEnvironment(scenario.environment), 'environment')
  for (const [sourceId, routes] of Object.entries(environment.routing.bySourceMemberId)) {
    if (!memberIds.has(sourceId) || Object.values(routes).some((targetId) => targetId !== null && !memberIds.has(targetId))) {
      throw new Error(`Refusing to save invalid combat scenario routing: ${id}`)
    }
  }
  if (environment.manualEffects.some((effect) => effect.selector.kind === 'members'
    && effect.selector.memberIds.some((memberId) => !memberIds.has(memberId)))) {
    throw new Error(`Refusing to save invalid combat scenario effects: ${id}`)
  }
  const target = previous.target === scenario.target ? scenario.target
    : requireValid<CombatScenario['target']>(parseScenarioTarget(scenario.target), 'target')
  const program = previous.program === scenario.program ? scenario.program
    : requireValid<CombatScenario['program']>(parseScenarioProgram(scenario.program), 'program')
  const dormantMembersByResonatorId = previous.dormantMembersByResonatorId === scenario.dormantMembersByResonatorId
    ? scenario.dormantMembersByResonatorId
    : scenario.dormantMembersByResonatorId
      ? requireValid<NonNullable<CombatScenario['dormantMembersByResonatorId']>>(
        parseDormantScenarioMembers(scenario.dormantMembersByResonatorId), 'dormant members')
      : undefined
  return {
    ...scenario,
    team: makeScenarioTeam(validatedMembers),
    target,
    environment,
    program,
    ...(dormantMembersByResonatorId ? { dormantMembersByResonatorId } : {}),
  }
}

function writeCombatWorkspace(combat: PersistedState['combat']): void {
  const oldRaw = localStorage.getItem(APPSTORECMBTINDEX)
  let oldIndex: CombatStorageIndex | null = null
  try {
    if (oldRaw) oldIndex = parseCombatStorageIndex(oldRaw)
  } catch {
    // A new manifest can recover from a damaged one without reusing its rows.
  }
  if (oldRaw !== lastCombatManifest) lastSavedCombatRefs.clear()
  // Records written before a failed manifest commit are unreachable. Reclaim
  // them before migration, while the complete legacy workspace is still safe.
  if (!oldIndex && localStorage.getItem(APPSTORECMBT) != null) {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index)
      if (key?.startsWith(APPSTORECMBTREC)) localStorage.removeItem(key)
    }
  }

  const order = combat.order
  const ids = Object.keys(combat.scenariosById)
  if (order.length === 0
    || new Set(order).size !== order.length
    || !Object.hasOwn(combat.scenariosById, combat.selectedScenarioId)
    || ids.length !== order.length
    || order.some((id) => !Object.hasOwn(combat.scenariosById, id))) {
    throw new Error('Refusing to save invalid combat workspace index.')
  }

  const recordsById: Record<string, string> = {}
  const summaryById: Record<string, ScenarioSummary> = {}
  const resonatorIdsById: Record<string, string[]> = {}
  const createdKeys: string[] = []
  const retiredKeys: string[] = []
  try {
    for (const id of order) {
      const previousKey = oldIndex?.recordsById[id]
      const descriptor = Object.getOwnPropertyDescriptor(combat.scenariosById, id)
      const getterKey = (descriptor?.get as StoredScenarioGetter | undefined)?.recordKey
      if (previousKey && getterKey === previousKey && oldRaw === lastCombatManifest) {
        recordsById[id] = previousKey
        resonatorIdsById[id] = oldIndex?.resonatorIdsById?.[id] ?? readStoredScenarioIds(previousKey)
        summaryById[id] = oldIndex?.summaryById?.[id]
          ?? combat.summaryById?.[id]
          ?? summarizeScenario(combat.scenariosById[id])
        continue
      }
      const scenario = combat.scenariosById[id]
      if (previousKey && lastSavedCombatRefs.get(id) === scenario) {
        recordsById[id] = previousKey
        resonatorIdsById[id] = oldIndex?.resonatorIdsById?.[id]
          ?? scenario.team.members.map((member) => member.resonatorId)
        summaryById[id] = combat.summaryById?.[id] ?? summarizeScenario(scenario)
        continue
      }
      const previousScenario = lastSavedCombatRefs.get(id)
      const previousManifest = previousKey ? scenarioManifest(previousKey) : null
      const validated = validateScenarioForWrite(id, scenario, previousScenario, previousManifest)
      const memberRecords: Record<string, string> = {}
      for (const member of validated.team.members) {
        const oldMember = previousScenario?.team.members.find((candidate) => candidate.id === member.id)
        const currentMember = scenario.team.members.find((candidate) => candidate.id === member.id)
        memberRecords[member.id] = oldMember === currentMember && previousManifest?.memberRecords[member.id]
          ? previousManifest.memberRecords[member.id]
          : writeCombatRecord(id, `member-${encodeURIComponent(member.id)}`, member, createdKeys)
      }
      const targetRecord = previousScenario?.target === scenario.target && previousManifest?.targetRecord
        ? previousManifest.targetRecord : writeCombatRecord(id, 'target', validated.target, createdKeys)
      const environmentRecord = previousScenario?.environment === scenario.environment && previousManifest?.environmentRecord
        ? previousManifest.environmentRecord : writeCombatRecord(id, 'environment', validated.environment, createdKeys)
      // Compact sequences are derived from the catalog when projected. Old
      // advanced content remains on disk until the saved-rotation migration
      // archives it, so a routine workspace save cannot erase that content.
      const resonatorId = contextScenarioMember(validated).resonatorId
      const legacyAdvancedSequence = validated.program.sequence.length > 0
        && !isRotationSequence(validated.program.sequence, resonatorId)
      const previousProgram = previousManifest?.programRecord
        ? decodeCombatRecord(previousManifest.programRecord) as Record<string, unknown>
        : null
      const previousStoredLegacySequence = previousProgram
        && Object.hasOwn(previousProgram, 'sequence')
      const reuseProgramRecord = previousScenario?.program === scenario.program
        && previousManifest?.programRecord
        && Boolean(previousStoredLegacySequence) === legacyAdvancedSequence
      const programRecord = reuseProgramRecord
        ? previousManifest.programRecord
        : writeCombatRecord(id, 'program', {
          ...(legacyAdvancedSequence ? { sequence: validated.program.sequence } : {}),
          program: validated.program.program,
          lastRanAt: validated.program.lastRanAt,
        }, createdKeys)
      const dormantRecord = scenario.dormantMembersByResonatorId
        ? previousScenario?.dormantMembersByResonatorId === scenario.dormantMembersByResonatorId && previousManifest?.dormantRecord
          ? previousManifest.dormantRecord
          : writeCombatRecord(id, 'dormant', validated.dormantMembersByResonatorId, createdKeys)
        : undefined
      const recordKey = writeCombatRecord(id, 'manifest', {
        format: 2,
        id,
        revision: validated.revision,
        contextMemberId: validated.contextMemberId,
        initialOnFieldMemberId: validated.initialOnFieldMemberId,
        team: validated.team.members.map((member) => member.resonatorId),
        memberIds: validated.team.members.map((member) => member.id),
        memberRecords,
        targetRecord,
        environmentRecord,
        programRecord,
        ...(dormantRecord ? { dormantRecord } : {}),
      } satisfies ScenarioRecordManifest, createdKeys)
      if (previousKey) retiredKeys.push(previousKey)
      if (previousManifest) {
        const retained = new Set([targetRecord, environmentRecord, programRecord, dormantRecord,
          ...Object.values(memberRecords)])
        for (const key of [previousManifest.targetRecord, previousManifest.environmentRecord,
          previousManifest.programRecord, previousManifest.dormantRecord,
          ...Object.values(previousManifest.memberRecords)]) {
          if (key && !retained.has(key)) retiredKeys.push(key)
        }
      }
      recordsById[id] = recordKey
      resonatorIdsById[id] = validated.team.members.map((member) => member.resonatorId)
      summaryById[id] = summarizeScenario(validated)
    }

    const nextRaw = JSON.stringify({
      version: APP_STATE_VER,
      selectedScenarioId: combat.selectedScenarioId,
      order,
      recordsById,
      summaryById,
      resonatorIdsById,
    } satisfies CombatStorageIndex)
    localStorage.setItem(APPSTORECMBTINDEX, nextRaw)
    lastCombatManifest = nextRaw
  } catch (error) {
    for (const key of createdKeys) localStorage.removeItem(key)
    throw error
  }
  let cleanupFailed = false
  for (const key of retiredKeys) {
    try { localStorage.removeItem(key) } catch { cleanupFailed = true }
  }
  lastSavedCombatRefs.clear()
  for (const id of order) {
    const descriptor = Object.getOwnPropertyDescriptor(combat.scenariosById, id)
    if (descriptor && 'value' in descriptor) lastSavedCombatRefs.set(id, descriptor.value)
  }
  if (cleanupFailed) scheduleCombatRecordCleanup()
  localStorage.removeItem(APPSTORECMBT)
}

function makeAppearance(state: PersistedState) {
  return {
    version: state.version,
    ui: {
      theme: state.ui.theme,
      themePreference: state.ui.themePreference,
      lightVariant: state.ui.lightVariant,
      darkVariant: state.ui.darkVariant,
      backgroundVariant: state.ui.backgroundVariant,
      backgroundImageKey: state.ui.backgroundImageKey,
      backgroundTextMode: state.ui.backgroundTextMode,
      bodyFontName: state.ui.bodyFontName,
      bodyFontUrl: state.ui.bodyFontUrl,
      blurMode: state.ui.blurMode,
      entranceAnimations: state.ui.entranceAnimations,
    },
  }
}

function makeLayout(state: PersistedState) {
  return {
    version: state.version,
    ui: {
      preferences: { ...state.ui.preferences, showcaseCards: {} },
      leftPaneView: state.ui.leftPaneView,
      suggsViewMode: state.ui.suggsViewMode,
      showSubHits: state.ui.showSubHits,
      compactInv: state.ui.compactInv,
      seeEquipped: state.ui.seeEquipped,
      haveHistory: state.ui.haveHistory,
      historyMax: state.ui.historyMax,
      itemFreq: state.ui.itemFreq,
      optimizerCpuHintSeen: state.ui.optimizerCpuHintSeen,
      compressedExports: state.ui.compressedExports,
      rotationEditorPreferences: state.ui.rotationEditorPreferences,
    },
  }
}

function makeRotPrefs(state: PersistedState) {
  return {
    version: state.version,
    ui: {
      savedRotationPreferences: state.ui.savedRotationPreferences,
    },
  }
}

function makeCombatWorkspace(state: PersistedState) {
  return {
    version: state.version,
    combat: state.combat,
  }
}

function makeOptSettingsSlice(state: PersistedState) {
  return {
    version: state.version,
    simulation: {
      optimizerSettingsResonatorId: state.simulation.optimizerSettingsResonatorId,
      optimizerSettings: state.simulation.optimizerSettings,
    },
  }
}

function makeSuggestSlice(state: PersistedState) {
  return {
    version: state.version,
    simulation: {
      weaponSuggests: state.simulation.weaponSuggests,
      suggestionsByResonatorId: state.simulation.suggestionsByResonatorId,
    },
  }
}

function makeInvEchoes(state: PersistedState) {
  return {
    version: state.version,
    library: {
      echoes: state.library.echoes,
    },
  }
}

function makeInvBuilds(state: PersistedState) {
  return {
    version: state.version,
    library: {
      builds: state.library.builds,
    },
  }
}

function makeInvRotSlice(state: PersistedState) {
  return {
    version: state.version,
    library: {
      rotations: state.library.rotations,
    },
  }
}

function makeInvScenarioSlice(state: PersistedState) {
  return {
    version: state.version,
    library: {
      scenarios: state.library.scenarios,
    },
  }
}

function encodePersistedDomain(key: PersistKey, value: unknown): string {
  const json = JSON.stringify(value)
  return key === 'library.rotations'
    ? `${COMPRESSED_ROTATIONS_PREFIX}${compressToUTF16(json)}`
    : json
}

function decodePersistedDomain(key: PersistKey, raw: string): string {
  if (key !== 'library.rotations' || !raw.startsWith(COMPRESSED_ROTATIONS_PREFIX)) {
    return raw
  }

  const json = decompressFromUTF16(raw.slice(COMPRESSED_ROTATIONS_PREFIX.length))
  if (json == null) throw new Error('Compressed inventory rotations are invalid.')
  return json
}

type PersistSpecMap = {
  'ui.appearance': PersistSpec<ReturnType<typeof makeAppearance>>
  'ui.showcaseCards': PersistSpec<{ cards: PersistedState['ui']['preferences']['showcaseCards'] }>
  'ui.layout': PersistSpec<ReturnType<typeof makeLayout>>
  'ui.savedRotationPreferences': PersistSpec<ReturnType<typeof makeRotPrefs>>
  'combat.workspace': PersistSpec<ReturnType<typeof makeCombatWorkspace>>
  'simulation.optimizerSettings': PersistSpec<ReturnType<typeof makeOptSettingsSlice>>
  'simulation.suggestions': PersistSpec<ReturnType<typeof makeSuggestSlice>>
  'library.echoes': PersistSpec<ReturnType<typeof makeInvEchoes>>
  'library.builds': PersistSpec<ReturnType<typeof makeInvBuilds>>
  'library.rotations': PersistSpec<ReturnType<typeof makeInvRotSlice>>
  'library.scenarios': PersistSpec<ReturnType<typeof makeInvScenarioSlice>>
}

type PrssDmnSlc<K extends PersistKey> =
  PersistSpecMap[K] extends PersistSpec<infer TSlice> ? TSlice : never

const DOMAIN_SPECS: PersistSpecMap = {
  'ui.showcaseCards': {
    label: 'Showcase cards', storageKey: SHOWCASE_INDEX,
    schema: { safeParse: (value: unknown) => ({ success: true as const, data: value }) },
    build: (state) => ({ cards: state.ui.preferences.showcaseCards }),
    apply: (state, slice) => { state.ui = { ...state.ui, preferences: { ...DEF_UI_PREFS, ...state.ui.preferences, showcaseCards: slice.cards } } },
  },
  'ui.appearance': {
    label: 'ui appearance',
    storageKey: APPSTOREUIPP,
    schema: prssUiPprnSl,
    build: makeAppearance,
    apply: (state, slice) => {
      state.ui = {
        ...state.ui,
        ...slice.ui,
      }
    },
  },
  'ui.layout': {
    label: 'ui layout',
    storageKey: APPSTOREUILY,
    schema: prssUiLytSlc,
    build: makeLayout,
    apply: (state, slice) => {
      state.ui = {
        ...state.ui,
        ...slice.ui,
      }
    },
  },
  'ui.savedRotationPreferences': {
    label: 'ui saved rotation preferences',
    storageKey: APPSTOREUISV,
    schema: prssUiSvdRoh,
    build: makeRotPrefs,
    apply: (state, slice) => {
      state.ui = {
        ...state.ui,
        ...slice.ui,
      }
    },
  },
  'combat.workspace': {
    label: 'combat workspace',
    storageKey: APPSTORECMBT,
    schema: prssCmbtWrkspSlcS,
    build: makeCombatWorkspace,
    apply: (state, slice) => {
      state.combat = slice.combat
    },
  },
  'simulation.optimizerSettings': {
    label: 'optimizer settings',
    storageKey: APPSTOREOPTS,
    schema: prssOptSettingsSl,
    build: makeOptSettingsSlice,
    apply: (state, slice) => {
      state.simulation = {
        ...state.simulation,
        optimizerSettingsResonatorId: slice.simulation.optimizerSettingsResonatorId,
        optimizerSettings: slice.simulation.optimizerSettings,
      }
    },
  },
  'simulation.suggestions': {
    label: 'suggestions',
    storageKey: SUGG_STORE_KEY,
    schema: prssSuggsSlc,
    build: makeSuggestSlice,
    apply: (state, slice) => {
      state.simulation = {
        ...state.simulation,
        weaponSuggests: slice.simulation.weaponSuggests,
        suggestionsByResonatorId: slice.simulation.suggestionsByResonatorId,
      }
    },
  },
  'library.echoes': {
    label: 'inventory echoes',
    storageKey: APPSTOREINVC,
    schema: prssInvChsSl,
    build: makeInvEchoes,
    apply: (state, slice) => {
      state.library = {
        ...state.library,
        echoes: slice.library.echoes,
      }
    },
  },
  'library.builds': {
    label: 'inventory builds',
    storageKey: APPSTOREINVB,
    schema: prssInvBldsS,
    build: makeInvBuilds,
    apply: (state, slice) => {
      state.library = {
        ...state.library,
        builds: slice.library.builds,
      }
    },
  },
  'library.rotations': {
    label: 'inventory rotations',
    storageKey: APPSTOREINVR,
    schema: prssInvRttnS,
    build: makeInvRotSlice,
    apply: (state, slice) => {
      state.library = {
        ...state.library,
        rotations: slice.library.rotations,
      }
    },
  },
  'library.scenarios': {
    label: 'saved scenarios',
    storageKey: APPSTOREINVS,
    schema: prssInvScenariosSl,
    build: makeInvScenarioSlice,
    apply: (state, slice) => {
      state.library = {
        ...state.library,
        scenarios: slice.library.scenarios,
      }
    },
  },
}

function getPrssDmnKe(includeInventory: boolean | 'gear'): PersistKey[] {
  if (includeInventory === 'gear') return [...NONINVDMNKEY, ...GEAR_DOMAIN_KEYS]
  return includeInventory
    ? ALL_DOMAIN_KEYS
    : NONINVDMNKEY
}

function hasCurStoreE(): boolean {
  return localStorage.getItem(APPSTORECMBTINDEX) != null
    || ALL_DOMAIN_KEYS.some((key) => localStorage.getItem(DOMAIN_SPECS[key].storageKey) != null)
}

function readMnlthPrssS(): HydratedAppState | null {
  const raw = localStorage.getItem(APP_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    const snapshot = parsePersisted(raw)
    saveAppState(snapshot)
    localStorage.removeItem(APP_STORAGE_KEY)
    return snapshot
  } catch (error) {
    console.warn('[storage] failed to migrate monolithic app snapshot', error)
    try {
      qrntStoreKey(APP_STORAGE_KEY, raw)
    } catch (rcvrRrr) {
      console.warn('[storage] failed to quarantine invalid monolithic app snapshot', rcvrRrr)
    }
    return null
  }
}

function readLegacyStateVersion(
  version: typeof LEGACY_STORAGE_VERSIONS[number],
): HydratedAppState | null {
  const legacyStorageKey = `wwcalc.app.v${version}`
  const monolith = localStorage.getItem(legacyStorageKey)
  if (monolith) {
    try {
      const snapshot = parsePersisted(monolith)
      saveAppState(snapshot)
      localStorage.removeItem(legacyStorageKey)
      return snapshot
    } catch (error) {
      console.warn(`[storage] failed to migrate v${version} app snapshot`, error)
    }
  }

  const legacySuffixes = [
    'ui.appearance',
    'ui.layout',
    'ui.saved-rotation-preferences',
    'session',
    ...(version === 26 || version === 25 || version === 24
      ? ['combat.workspace']
      : version === 23
        ? ['workspace']
        : []),
    'profiles',
    'optimizer-context',
    'suggestions',
    'inventory.echoes',
    'inventory.builds',
    'inventory.rotations',
    ...(version === 26 ? ['inventory.scenarios'] : []),
  ]
  const defaults = makeAppState()
  const draft = structuredClone(defaults) as unknown as Record<string, unknown>
  const draftUi = draft.ui as Record<string, unknown>
  const draftCalculator = draft.simulation as Record<string, unknown>
  // Let the legacy optimizer-context slice supply its settings. Leaving the
  // v27 default here would make migration mistake it for explicitly stored data.
  delete draftCalculator.optimizerSettings
  delete draft.combat
  delete draft.library
  draft.version = version
  let found = false

  for (const suffix of legacySuffixes) {
    const raw = localStorage.getItem(`${legacyStorageKey}.${suffix}`)
    if (!raw) continue
    try {
      const slice = JSON.parse(raw) as {
        ui?: Record<string, unknown>
        combat?: Record<string, unknown>
        calculator?: Record<string, unknown>
        simulation?: Record<string, unknown>
        library?: Record<string, unknown>
      }
      if (slice.ui) Object.assign(draftUi, slice.ui)
      if (slice.combat) draft.combat = slice.combat
      if (slice.simulation ?? slice.calculator) {
        Object.assign(draftCalculator, slice.simulation ?? slice.calculator)
      }
      if (slice.library) {
        const draftLibrary = draft.library && typeof draft.library === 'object'
          ? draft.library as Record<string, unknown>
          : { echoes: [], builds: [], rotations: [], scenarios: [] }
        Object.assign(draftLibrary, slice.library)
        draft.library = draftLibrary
      }
      found = true
    } catch (error) {
      console.warn(`[storage] failed to read legacy v${version} ${suffix}`, error)
    }
  }

  if (!found) return null
  const current = persistedSchema.safeParse(draft)
  if (!current.success) {
    console.warn(`[storage] failed to validate assembled v${version} app state`, current.error)
    return null
  }

  const snapshot = initAppState(current.data as unknown as PersistedState)
  saveAppState(snapshot)
  for (const suffix of legacySuffixes) {
    localStorage.removeItem(`${legacyStorageKey}.${suffix}`)
  }
  return snapshot
}

function readLegacyState(): HydratedAppState | null {
  for (const version of LEGACY_STORAGE_VERSIONS) {
    const migrated = readLegacyStateVersion(version)
    if (migrated) return migrated
  }
  return null
}

function qrntStoreKey(key: string, raw: string): void {
  localStorage.setItem(`${APPSTORERCVR}.${Date.now()}.${key}`, raw)
  localStorage.removeItem(key)
}

function readVldtStor<T>(
  raw: string,
  schema: PrssDmnSchm,
  label: string,
): T {
  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`${label} is not valid JSON.`)
  }

  const result = schema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`${label} validation failed.`)
  }

  return result.data as T
}

function readPrssDmn<K extends PersistKey>(
  key: K,
  loadedJson?: Map<PersistKey, string>,
): PrssDmnSlc<K> | null {
  if (key === 'ui.showcaseCards') {
    const cards = readShowcaseCards()
    return cards ? { cards } as PrssDmnSlc<K> : null
  }
  if (key === 'combat.workspace') {
    const indexed = readCombatWorkspace()
    if (indexed) return indexed as PrssDmnSlc<K>
  }
  const spec = DOMAIN_SPECS[key]
  const raw = localStorage.getItem(spec.storageKey)
  if (!raw) {
    return null
  }

  try {
    const json = decodePersistedDomain(key, raw)
    const slice = readVldtStor<PrssDmnSlc<K>>(json, spec.schema, spec.label)
    // Plain rotations still need their one-time compression migration. Retain
    // other decoded payloads only for this load, to detect real repair writes.
    if (key !== 'library.rotations' || raw.startsWith(COMPRESSED_ROTATIONS_PREFIX)) {
      loadedJson?.set(key, json)
    }
    return slice
  } catch (error) {
    console.warn(`[storage] failed to parse ${spec.label}`, error)
    try {
      qrntStoreKey(spec.storageKey, raw)
    } catch (rcvrRrr) {
      console.warn(`[storage] failed to quarantine invalid ${spec.label}`, rcvrRrr)
    }
    return null
  }
}

function makePersistDraft(includeInventory: boolean): PersistDraft {
  const defaults = makeAppState()

  return {
    version: APP_STATE_VER,
    combat: defaults.combat,
    ui: {
      ...defaults.ui,
    },
    simulation: { ...defaults.simulation },
    library: includeInventory
      ? defaults.library
      : { echoes: [], builds: [], rotations: [], scenarios: [] },
  }
}

function normPrssAppS(parsed: unknown): HydratedAppState {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Snapshot must be a JSON object.')
  }

  const current = persistedSchema.safeParse(parsed)
  if (current.success) {
    return initAppState(current.data as unknown as PersistedState)
  }

  throw new Error('Snapshot validation failed.')
}

function normalizeAppState(
  state: PersistedUnknown,
): HydratedAppState {
  const indexed = state.combat as ScenarioWorkspace | undefined
  if (indexed?.summaryById && indexed.order.some((id) =>
    Boolean(Object.getOwnPropertyDescriptor(indexed.scenariosById, id)?.get))) {
    const selectedId = indexed.selectedScenarioId
    const selected = indexed.scenariosById[selectedId]
    const normalized = initAppState({
      ...state,
      combat: {
        selectedScenarioId: selectedId,
        order: [selectedId],
        scenariosById: { [selectedId]: selected },
      },
    })
    const selectedNormalized = normalized.combat.scenariosById[selectedId]
    const scenariosById = copyScenarioRecords(indexed.scenariosById)
    Object.defineProperty(scenariosById, selectedId, {
      value: selectedNormalized,
      enumerable: true,
      configurable: true,
      writable: true,
    })
    return {
      ...normalized,
      combat: {
        selectedScenarioId: selectedId,
        order: indexed.order,
        scenariosById,
        summaryById: {
          ...indexed.summaryById,
          [selectedId]: summarizeScenario(selectedNormalized),
        },
      },
    }
  }
  return initAppState(state)
}

function ssmbPrssAppS(includeInventory: boolean | 'gear'): HydratedAppState | null {
  const state = makePersistDraft(Boolean(includeInventory))
  const loadedDomains: PersistKey[] = []
  let hasLddDmn = false

  for (const key of getPrssDmnKe(includeInventory)) {
    const domain = readPrssDmn(key)
    if (!domain) {
      continue
    }

    DOMAIN_SPECS[key].apply(state, domain)
    loadedDomains.push(key)
    hasLddDmn = true
  }

  if (!hasLddDmn) {
    return readMnlthPrssS() ?? readLegacyState()
  }

  const normalState = normalizeAppState(state)
  const hadIndexedCombat = loadedDomains.includes('combat.workspace')
    && lastCombatManifest === localStorage.getItem(APPSTORECMBTINDEX)
    && lastCombatManifest != null
  saveAppState(normalState, {
    domains: hadIndexedCombat
      ? loadedDomains.filter((key) => key !== 'combat.workspace')
      : loadedDomains,
  })
  if (hadIndexedCombat) {
    lastSavedCombatRefs.clear()
    for (const id of normalState.combat.order) {
      const descriptor = Object.getOwnPropertyDescriptor(normalState.combat.scenariosById, id)
      if (descriptor && 'value' in descriptor) lastSavedCombatRefs.set(id, descriptor.value)
    }
  }
  return normalState
}

// parse persisted app state from raw json text
export function parsePersisted(raw: string): HydratedAppState {
  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Snapshot is not valid JSON.')
  }

  return normPrssAppS(parsed)
}

// Gear supports equipped-status checks throughout the app; saved snapshots are opt-in.
export function loadPrssAppS(
  options: { includeInventory?: boolean | 'gear' } = {},
): HydratedAppState | null {
  const includeInventory = options.includeInventory ?? true

  const loaded = hasCurStoreE()
    ? ssmbPrssAppS(includeInventory)
    : readMnlthPrssS() ?? readLegacyState()
  if (!loaded || includeInventory === true) return loaded
  // Legacy migration persists the complete library before trimming resident data.
  return {
    ...loaded,
    library: {
      echoes: includeInventory === 'gear' ? loaded.library.echoes : [],
      builds: includeInventory === 'gear' ? loaded.library.builds : [],
      rotations: [],
      scenarios: [],
    },
  }
}

export function loadPrssInvS(scope: 'gear' | 'saved' | 'all' = 'all'): PersistedState['library'] {
  const domains = scope === 'gear' ? GEAR_DOMAIN_KEYS
    : scope === 'saved' ? SAVED_ROTATION_DOMAIN_KEYS : INV_DOMAIN_KEYS
  const state = makePersistDraft(true)
  const loadedJson = new Map<PersistKey, string>()
  let hasLddInv = false

  for (const key of domains) {
    const domain = readPrssDmn(key, loadedJson)
    if (!domain) {
      continue
    }

    DOMAIN_SPECS[key].apply(state, domain)
    hasLddInv = true
  }

  if (!hasLddInv && scope === 'all' && !hasCurStoreE()) {
    const migrated = readMnlthPrssS() ?? readLegacyState()
    if (migrated) {
      return migrated.library
    }

    return { echoes: [], builds: [], rotations: [], scenarios: [] }
  }

  const normalState = normalizeAppState(state)
  // Hydration runs again after inventory eviction. Recompressing and rewriting
  // every unchanged rotation here used to block the next modal's open handler.
  // Compare the same validated shape that persistence writes; catalog repairs
  // and encoding migrations still reach storage, once, through the usual path.
  const changedDomains = domains.filter((key) => {
    const spec = DOMAIN_SPECS[key]
    const result = spec.schema.safeParse(spec.build(normalState))
    return !result.success || loadedJson.get(key) !== JSON.stringify(result.data)
  })
  if (changedDomains.length > 0) {
    saveAppState(normalState, { domains: changedDomains })
  }

  return normalState.library
}

// validate and save persisted app state domains
export function saveAppState(
  state: PersistedState,
  options: { domains?: PersistKey[] } = {},
): void {
  // Ordinary store writes already pass canonical state. Normalizing the whole
  // application here used to clone/rebuild every scenario and inventory domain
  // even when one small domain was dirty. Keep full normalization for the
  // migration/recovery path (no explicit domains), and validate only the
  // requested slices for routine writes.
  let persistedState: PersistedState = state
  if (!options.domains) {
    try {
      persistedState = normalizeAppState(state as unknown as PersistedUnknown)
    } catch (error) {
      console.warn('[storage] failed to normalize app state for persistence', error)
      return
    }
  }

  const domains = new Set(options.domains ?? ALL_DOMAIN_KEYS)
  // Always migrate cards before a layout write can remove their legacy copy.
  if (domains.has('ui.layout') || domains.has('ui.showcaseCards')) {
    try { writeShowcaseCards(persistedState.ui.preferences.showcaseCards) }
    catch (error) {
      console.warn('[storage] failed to persist Showcase cards', error)
      domains.delete('ui.layout')
    }
    domains.delete('ui.showcaseCards')
  }
  for (const key of domains) {
    if (key === 'combat.workspace') {
      try {
        writeCombatWorkspace(persistedState.combat)
      } catch (error) {
        console.warn('[storage] failed to persist combat workspace', error)
      }
      continue
    }
    const spec = DOMAIN_SPECS[key]
    const slice = spec.build(persistedState)
    const result = spec.schema.safeParse(slice)
    if (!result.success) {
      console.error(`[storage] refusing to save invalid ${spec.label}`, result.error)
      continue
    }

    try {
      localStorage.setItem(spec.storageKey, encodePersistedDomain(key, result.data))
    } catch (error) {
      console.warn(`[storage] failed to persist ${spec.label}`, error)
    }
  }

  try {
    localStorage.removeItem(RETIRED_SESSION_STORE_KEY)
  } catch (error) {
    console.warn('[storage] failed to remove retired session state', error)
  }
}

export function markPrssDmns(keys: PersistKey[]): void {
  let changed = false

  for (const key of keys) {
    if (pndnPrssDmns.has(key)) {
      continue
    }

    pndnPrssDmns.add(key)
    changed = true
  }

  if (!changed) {
    return
  }

  for (const listener of pndnPrssDmnL) {
    listener()
  }
}

export function consumePersist(): PersistKey[] {
  const keys = [...pndnPrssDmns]
  pndnPrssDmns.clear()
  return keys
}

export function sbscToDrtyPr(listener: () => void): () => void {
  pndnPrssDmnL.add(listener)
  return () => {
    pndnPrssDmnL.delete(listener)
  }
}

// clear persisted app state entries
export function clrPrssAppSt(): void {
  clearShowcaseCards()
  pndnPrssDmns.clear()
  localStorage.removeItem(APP_STORAGE_KEY)
  localStorage.removeItem(RETIRED_SESSION_STORE_KEY)
  localStorage.removeItem(APPSTOREPRFL)

  for (const key of ALL_DOMAIN_KEYS) {
    localStorage.removeItem(DOMAIN_SPECS[key].storageKey)
  }

  if (typeof localStorage.key !== 'function') {
    return
  }

  const recoveryKeys: string[] = []

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (key?.startsWith(`${APPSTORERCVR}.`)) {
      recoveryKeys.push(key)
    }
  }

  for (const key of recoveryKeys) {
    localStorage.removeItem(key)
  }
}
