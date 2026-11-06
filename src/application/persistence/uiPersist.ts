/*
  Author: Runor Ewhro
  description: validates, normalizes, and defaults the host-owned ui slice of
               the persisted app state.
*/

import * as z from 'zod/mini'
import { APP_STATE_VER } from '@/application/persistence/appStateVersion'
import { DEF_UI_PREFS } from '@/domain/entities/preferences'
import { DEFAULT_BODY_FONT, DEF_BG_KEY, getPresetFontUrl } from '@/domain/entities/appearance'
import { DEFAULT_ROTATION_EDITOR_STAT_KEYS, ROTATION_EDITOR_DAMAGE_DECIMALS, ROTATION_EDITOR_REGISTER_GROUPS, ROTATION_EDITOR_STAT_KEYS, makeDefaultRotationEditorPreferences } from '@/domain/entities/rotationEditorPreferences'
import { BG_THEMES, DARK_THEMES, LIGHT_THEMES } from '@/domain/entities/themes'
import type { StoredUiState, ThemeMode, ThemePref, UiState } from '@/domain/entities/uiState'
import { mkDefPckrFre, mkEmptyPckrFreqBkt, normalizePckrFreqState } from '@/engine/runtime/pickerFrequency'

// strip retired keys before strict validation so older persisted layouts remain readable.
function stripRetiredUiKeys(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value
  }

  const rest = { ...value as Record<string, unknown> }
  delete rest.mainMode
  delete rest.leftPaneView
  delete rest.optimizerUseSprite
  return rest
}

const uiBoolSchm = (defaultValue: boolean) => z.pipe(z.transform((value) => {
  if (typeof value === 'string') {
    if (value === 'on') {
      return true
    }
    if (value === 'off') {
      return false
    }
  }

  return value
}), z._default(z.boolean(), defaultValue))

// saved rotation page ui preferences
const svdRotPrefsS = z.lazy(() => z.pipe(z.transform((value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value
  }
  const preferences = { ...value } as Record<string, unknown>
  delete preferences.filterMode
  return preferences
}), z.strictObject({
  sortBy: z._default(z.enum(['date', 'name', 'avg', 'dps']), 'date'),
  sortOrder: z._default(z.enum(['asc', 'desc']), 'desc'),
  contributionFilter: z._default(z.enum(['unset', 'solo', 'duo', 'trio']), 'unset'),
  autoSearchActiveResonator: z._default(z.boolean(), false),
  showLiveRotation: z._default(z.boolean(), false),
  scaleToSelected: z._default(z.boolean(), true),
})))

const rotEditorPrefsS = z.lazy(() => z.strictObject({
  view: z._default(z.enum(['tree', 'flat']), 'tree'),
  ghostRepeats: z._default(z.boolean(), true),
  showPriors: z._default(z.boolean(), false),
  statKeys: z._default(z.array(z.enum(ROTATION_EDITOR_STAT_KEYS)).check(z.maxLength(ROTATION_EDITOR_STAT_KEYS.length)).check(z.refine((keys) => new Set(keys).size === keys.length, 'Rotation editor columns must be unique')), [...DEFAULT_ROTATION_EDITOR_STAT_KEYS]),
  groupOrder: z._default(z.array(z.enum(ROTATION_EDITOR_REGISTER_GROUPS)).check(z.length(ROTATION_EDITOR_REGISTER_GROUPS.length)).check(z.refine((groups) => new Set(groups).size === groups.length, 'Rotation editor groups must be unique')), [...ROTATION_EDITOR_REGISTER_GROUPS]),
  dockPane: z._default(z.boolean(), false),
  damageBasis: z._default(z.enum(['avg', 'full']), 'avg'),
  decimals: z._default(z.union(ROTATION_EDITOR_DAMAGE_DECIMALS.map((value) => (
    z.literal(value)
  )) as [
    z.ZodMiniLiteral<0>,
    z.ZodMiniLiteral<1>,
    z.ZodMiniLiteral<2>,
    z.ZodMiniLiteral<3>,
    z.ZodMiniLiteral<4>,
  ]), 2),
  percentDisplay: z._default(z.enum(['percent', 'factor']), 'percent'),
  savedView: z._default(z.enum(['off', 'list', 'groups']), 'off'),
}))

const histMaxSchm = z.lazy(() => z._default(z.union([
  z.literal(5),
  z.literal(10),
  z.literal(25),
  z.literal(50),
  z.literal(75),
  z.literal(100),
]), 10))

const pckrFreqItmS = z.lazy(() => z.strictObject({
  id: z.string(),
  count: z.number().check(z.int()).check(z.positive()),
  firstUsedAt: z._default(z.nullable(z.string()), null),
  lastUsedAt: z._default(z.nullable(z.string()), null),
  previousUsedAt: z._default(z.nullable(z.string()), null),
  firstUseSeq: z._default(z.number().check(z.int()).check(z.nonnegative()), 0),
  lastUseSeq: z._default(z.number().check(z.int()).check(z.nonnegative()), 0),
  usesByDay: z._default(z.record(z.string(), z.number().check(z.int()).check(z.positive())), {}),
  firstActiveResonatorId: z._default(z.nullable(z.string()), null),
  lastActiveResonatorId: z._default(z.nullable(z.string()), null),
  previousActiveResonatorId: z._default(z.nullable(z.string()), null),
  usesByActiveResonator: z._default(z.record(z.string(), z.number().check(z.int()).check(z.positive())), {}),
}))

const pckrFreqBktS = z.lazy(() => z._default(z.strictObject({
  version: z._default(z.literal(2), 2),
  totalUses: z._default(z.number().check(z.int()).check(z.nonnegative()), 0),
  firstUsedAt: z._default(z.nullable(z.string()), null),
  lastUsedAt: z._default(z.nullable(z.string()), null),
  order: z._default(z.array(z.string()), []),
  items: z._default(z.record(z.string(), pckrFreqItmS), {}),
}), mkEmptyPckrFreqBkt))

const pckrFreqSttS = z.lazy(() => z.pipe(z.transform((value: unknown): unknown => normalizePckrFreqState(value)), z._default(z.strictObject({
  resonator: pckrFreqBktS,
  echo: pckrFreqBktS,
  enemy: pckrFreqBktS,
  weaponByType: z._default(z.strictObject({
    broadblade: pckrFreqBktS,
    sword: pckrFreqBktS,
    pistols: pckrFreqBktS,
    gauntlets: pckrFreqBktS,
    rectifier: pckrFreqBktS,
  }), {
    broadblade: mkEmptyPckrFreqBkt(),
    sword: mkEmptyPckrFreqBkt(),
    pistols: mkEmptyPckrFreqBkt(),
    gauntlets: mkEmptyPckrFreqBkt(),
    rectifier: mkEmptyPckrFreqBkt(),
  }),
  resonatorByTeamSlot: z._default(z.strictObject({
    active: pckrFreqBktS,
    teammate1: pckrFreqBktS,
    teammate2: pckrFreqBktS,
  }), {
    active: mkEmptyPckrFreqBkt(),
    teammate1: mkEmptyPckrFreqBkt(),
    teammate2: mkEmptyPckrFreqBkt(),
  }),
}), mkDefPckrFre)))

function normalizeSimulationPrefs(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value
  }

  const prefs = value as Record<string, unknown>
  const legacyCards = prefs.benchmarkCards
  const cards = prefs.showcaseCards ?? legacyCards
  const showcaseCards = cards && typeof cards === 'object' && !Array.isArray(cards)
    ? Object.fromEntries(Object.entries(cards as Record<string, unknown>).map(([id, config]) => {
        if (!config || typeof config !== 'object' || Array.isArray(config)) return [id, config]
        const card = config as Record<string, unknown>
        const style = card.style && typeof card.style === 'object' && !Array.isArray(card.style)
          ? card.style as Record<string, unknown>
          : null
        const customCss = typeof style?.customCss === 'string'
          ? style.customCss.replaceAll('.bench-', '.workspace-').replaceAll('--bench-', '--workspace-')
          : style?.customCss
        return [id, style ? { ...card, style: { ...style, customCss } } : card]
      }))
    : {}

  const normalized: Record<string, unknown> = {
    ...prefs,
    animatedRailPortraits: typeof prefs.animatedRailPortraits === 'boolean'
      ? prefs.animatedRailPortraits
      : typeof prefs.benchAnim2d === 'boolean' ? prefs.benchAnim2d : DEF_UI_PREFS.animatedRailPortraits,
    showcaseCards,
  }
  delete normalized.showEvaluationStates
  delete normalized.showBenchStates
  delete normalized.benchAnim2d
  delete normalized.benchmarkCards
  delete normalized.benchmarkViewMode
  return normalized
}

export const showcaseCardSchema = z.lazy(() => z.object({
        style: z.object({
          accent: z._default(z.nullable(z.string()), null),
          surface: z._default(z.nullable(z.string()), null),
          text: z._default(z.nullable(z.string()), null),
          opacity: z._default(z.nullable(z.number()), null),
          displayFont: z._default(z.nullable(z.string()), null),
          monoFont: z._default(z.nullable(z.string()), null),
          portraitX: z._default(z.nullable(z.number()), null),
          portraitY: z._default(z.nullable(z.number()), null),
          portraitScale: z._default(z.nullable(z.number()), null),
          maskTop: z._default(z.nullable(z.number()), null),
          maskRight: z._default(z.nullable(z.number()), null),
          maskBottom: z._default(z.nullable(z.number()), null),
          maskLeft: z._default(z.nullable(z.number()), null),
          maskTopSharp: z._default(z.nullable(z.number()), null),
          maskRightSharp: z._default(z.nullable(z.number()), null),
          maskBottomSharp: z._default(z.nullable(z.number()), null),
          maskLeftSharp: z._default(z.nullable(z.number()), null),
          backdropBlur: z._default(z.nullable(z.number()), null),
          backdropOpacity: z._default(z.nullable(z.number()), null),
          backdropX: z._default(z.nullable(z.number()), null),
          backdropY: z._default(z.nullable(z.number()), null),
          backdropScale: z._default(z.nullable(z.number()), null),
          portraitImage: z._default(z.nullable(z.string()), null),
          backdropImage: z._default(z.nullable(z.string()), null),
          portraitCredit: z._default(z.nullable(z.string()), null),
          backdropCredit: z._default(z.nullable(z.string()), null),
          statsColumn: z._default(z.nullable(z.enum(['build', 'combat', 'both'])), null),
          textSlots: z._default(z.record(
            z.string(),
            z.object({
              color: z._default(z.nullable(z.string()), null),
              font: z._default(z.nullable(z.string()), null),
              size: z._default(z.nullable(z.number()), null),
              weight: z._default(z.nullable(z.number()), null),
              spacing: z._default(z.nullable(z.number()), null),
              transform: z._default(z.nullable(z.enum(['none', 'uppercase', 'lowercase', 'capitalize'])), null),
            }),
          ), {}),
          customCss: z._default(z.nullable(z.string()), null),
        }),
        hidden: z.object({
          score: z._default(z.boolean(), false),
          damage: z._default(z.boolean(), false),
          cv: z._default(z.boolean(), false),
          team: z._default(z.boolean(), false),
          brand: z._default(z.boolean(), false),
          portraitCredit: z._default(z.boolean(), false),
          backdropCredit: z._default(z.boolean(), false),
          seqRail: z._default(z.boolean(), false),
          subVal: z._default(z.boolean(), false),
          subColor: z._default(z.boolean(), false),
          relStats: z._default(z.boolean(), true),
        }),
      }))

const uiPersistSchema = z.strictObject({
  theme: z.enum(['light', 'dark', 'background']),
  themePreference: z.optional(z.enum(['system', 'light', 'dark', 'background'])),
  lightVariant: z.enum(LIGHT_THEMES),
  darkVariant: z.enum(DARK_THEMES),
  backgroundVariant: z.enum(BG_THEMES),
  backgroundImageKey: z._default(z.string(), 'builtin:wallpaperflare1.jpg'),
  backgroundTextMode: z._default(z.enum(['light', 'dark']), 'dark'),
  bodyFontName: z._default(z.string(), DEFAULT_BODY_FONT),
  bodyFontUrl: z._default(z.string(), getPresetFontUrl(DEFAULT_BODY_FONT)),
  blurMode: uiBoolSchm(false),
  entranceAnimations: uiBoolSchm(true),
  preferences: z.pipe(z.transform(normalizeSimulationPrefs), z._default(z.object({
    ctxMenu: z._default(z.boolean(), DEF_UI_PREFS.ctxMenu),
    updateToast: z._default(z.boolean(), DEF_UI_PREFS.updateToast),
    gameBetaData: z._default(z.boolean(), DEF_UI_PREFS.gameBetaData),
    roverGender: z._default(z.enum(['both', 'male', 'female']), DEF_UI_PREFS.roverGender),
    recommendedMenuItems: z._default(z.boolean(), DEF_UI_PREFS.recommendedMenuItems),
    maxResOnInit: z._default(z.boolean(), DEF_UI_PREFS.maxResOnInit),
    animatedRailPortraits: z._default(z.boolean(), DEF_UI_PREFS.animatedRailPortraits),
    showcaseCards: z._default(z.record(
      z.string(),
      showcaseCardSchema,
    ), {}),
    showcaseLayout: z._default(z.enum(['classic', 'seal']), DEF_UI_PREFS.showcaseLayout),
    uploadPersist: z._default(z.nullable(z.enum(['indexeddb', 'imgbb'])), DEF_UI_PREFS.uploadPersist),
    imgbbApiKey: z._default(z.string(), DEF_UI_PREFS.imgbbApiKey),
    playerId: z._default(z.string(), DEF_UI_PREFS.playerId),
    playerUid: z._default(z.string(), DEF_UI_PREFS.playerUid),
    echoImportBands: z._default(z.object({
      resonator: z._default(z.boolean(), DEF_UI_PREFS.echoImportBands.resonator),
      weapon: z._default(z.boolean(), DEF_UI_PREFS.echoImportBands.weapon),
      echoes: z._default(z.boolean(), DEF_UI_PREFS.echoImportBands.echoes),
    }), DEF_UI_PREFS.echoImportBands),
    rotationImportPick: z._default(z.object({
      load: z._default(z.enum(['rotation', 'build', 'none']), DEF_UI_PREFS.rotationImportPick.load),
      save: z._default(z.boolean(), DEF_UI_PREFS.rotationImportPick.save),
    }), DEF_UI_PREFS.rotationImportPick),
  }), DEF_UI_PREFS)),
  suggsViewMode: z._default(z.enum(['mainStats', 'setPlans', 'weapons', 'random', 'substats']), 'mainStats'),
  showSubHits: z.boolean(),
  compactInv: z._default(z.boolean(), false),
  groupInv: z._default(z.boolean(), true),
  seeEquipped: z._default(z.boolean(), true),
  haveHistory: z._default(z.boolean(), true),
  historyMax: histMaxSchm,
  itemFreq: pckrFreqSttS,
  optimizerCpuHintSeen: z._default(z.boolean(), false),
  // export files default to the compact .wwcalc format; plain json is the
  // readable fallback.
  compressedExports: z._default(z.boolean(), true),
  rotationEditorPreferences: z._default(rotEditorPrefsS, makeDefaultRotationEditorPreferences()),
  savedRotationPreferences: z._default(svdRotPrefsS, {
    sortBy: 'date',
    sortOrder: 'desc',
    contributionFilter: 'unset',
    autoSearchActiveResonator: false,
    showLiveRotation: false,
    scaleToSelected: true,
  }),
})

/** the ui slice as stored on the whole persisted document. */
export const persistedUiSchema = z.lazy(() => z.pipe(z.transform(stripRetiredUiKeys), uiPersistSchema))

export const prssUiPprnSc = z.lazy(() => z.strictObject({
  theme: uiPersistSchema.shape.theme,
  themePreference: uiPersistSchema.shape.themePreference,
  lightVariant: uiPersistSchema.shape.lightVariant,
  darkVariant: uiPersistSchema.shape.darkVariant,
  backgroundVariant: uiPersistSchema.shape.backgroundVariant,
  backgroundImageKey: uiPersistSchema.shape.backgroundImageKey,
  backgroundTextMode: uiPersistSchema.shape.backgroundTextMode,
  bodyFontName: uiPersistSchema.shape.bodyFontName,
  bodyFontUrl: uiPersistSchema.shape.bodyFontUrl,
  blurMode: uiPersistSchema.shape.blurMode,
  entranceAnimations: uiPersistSchema.shape.entranceAnimations,
}))

export const prssUiLytSch = z.lazy(() => z.strictObject({
  preferences: uiPersistSchema.shape.preferences,
  suggsViewMode: uiPersistSchema.shape.suggsViewMode,
  showSubHits: uiPersistSchema.shape.showSubHits,
  compactInv: uiPersistSchema.shape.compactInv,
  groupInv: uiPersistSchema.shape.groupInv,
  seeEquipped: uiPersistSchema.shape.seeEquipped,
  haveHistory: uiPersistSchema.shape.haveHistory,
  historyMax: uiPersistSchema.shape.historyMax,
  itemFreq: uiPersistSchema.shape.itemFreq,
  optimizerCpuHintSeen: uiPersistSchema.shape.optimizerCpuHintSeen,
  compressedExports: uiPersistSchema.shape.compressedExports,
  rotationEditorPreferences: uiPersistSchema.shape.rotationEditorPreferences,
}))

export const prssUiSvdRot = z.lazy(() => z.strictObject({
  savedRotationPreferences: uiPersistSchema.shape.savedRotationPreferences,
}))

export const prssUiPprnSl = z.lazy(() => z.strictObject({
  version: z.literal(APP_STATE_VER),
  ui: prssUiPprnSc,
}))

export const prssUiLytSlc = z.lazy(() => z.strictObject({
  version: z.literal(APP_STATE_VER),
  ui: z.pipe(z.transform(stripRetiredUiKeys), prssUiLytSch),
}))

export const prssUiSvdRoh = z.lazy(() => z.strictObject({
  version: z.literal(APP_STATE_VER),
  ui: prssUiSvdRot,
}))

export function defaultSavedPrefs(): UiState['savedRotationPreferences'] {
  return {
    sortBy: 'date',
    sortOrder: 'desc',
    contributionFilter: 'unset',
    autoSearchActiveResonator: false,
    showLiveRotation: false,
    scaleToSelected: true,
  }
}

/** fresh ui slice for a new install. */
export function makeDefaultUiState(theme: ThemeMode = 'dark'): UiState {
  return {
    theme,
    themePreference: 'background' === theme ? 'background' : 'dark',
    lightVariant: LIGHT_THEMES[0],
    darkVariant: DARK_THEMES[0],
    backgroundVariant: BG_THEMES[0],
    backgroundImageKey: DEF_BG_KEY,
    backgroundTextMode: 'dark',
    bodyFontName: DEFAULT_BODY_FONT,
    bodyFontUrl: getPresetFontUrl(DEFAULT_BODY_FONT),
    blurMode: false,
    entranceAnimations: true,
    preferences: structuredClone(DEF_UI_PREFS),
    suggsViewMode: 'mainStats',
    showSubHits: false,
    compactInv: false,
    groupInv: true,
    seeEquipped: true,
    haveHistory: true,
    historyMax: 10,
    itemFreq: mkDefPckrFre(),
    optimizerCpuHintSeen: false,
    compressedExports: true,
    rotationEditorPreferences: makeDefaultRotationEditorPreferences(),
    savedRotationPreferences: defaultSavedPrefs(),
  }
}

/** fill retired defaults into a stored ui slice. */
export function normalizeUiState(rawUi: StoredUiState | undefined): UiState {
  const base = makeDefaultUiState()
  const stored: StoredUiState = { ...base, ...(rawUi ?? {}) }
  const themePref: ThemePref = stored.themePreference
    ?? (stored.theme === 'background' ? 'background' : 'system')

  return {
    ...stored,
    themePreference: themePref,
    backgroundImageKey: stored.backgroundImageKey ?? DEF_BG_KEY,
    backgroundTextMode: stored.backgroundTextMode ?? 'light',
    bodyFontName: stored.bodyFontName ?? DEFAULT_BODY_FONT,
    bodyFontUrl: stored.bodyFontUrl ?? getPresetFontUrl(stored.bodyFontName ?? DEFAULT_BODY_FONT),
    optimizerCpuHintSeen: stored.optimizerCpuHintSeen ?? false,
    compressedExports: stored.compressedExports ?? true,
    rotationEditorPreferences: {
      ...makeDefaultRotationEditorPreferences(),
      ...stored.rotationEditorPreferences,
      statKeys: stored.rotationEditorPreferences?.statKeys
        ? [...stored.rotationEditorPreferences.statKeys]
        : makeDefaultRotationEditorPreferences().statKeys,
      groupOrder: stored.rotationEditorPreferences?.groupOrder
        ? [...stored.rotationEditorPreferences.groupOrder]
        : makeDefaultRotationEditorPreferences().groupOrder,
    },
    preferences: {
      ...DEF_UI_PREFS,
      ...(stored.preferences ?? {}),
    },
    suggsViewMode: stored.suggsViewMode ?? 'mainStats',
    compactInv: stored.compactInv ?? false,
    groupInv: stored.groupInv ?? true,
    seeEquipped: stored.seeEquipped ?? false,
    historyMax: stored.historyMax ?? 10,
    itemFreq: normalizePckrFreqState(stored.itemFreq),
    savedRotationPreferences: {
      ...defaultSavedPrefs(),
      ...stored.savedRotationPreferences,
    },
  }
}
