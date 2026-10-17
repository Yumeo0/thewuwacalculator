/*
  Author: Runor Ewhro
  description: defines the host-owned ui slice of the persisted app state:
               theme, layout, picker frequency, and rotation editor prefs.
*/

import type { SuggsViewMod } from '@wuwacalc/core/domain/entities/suggestions'
import type { BgThemeVar, BlurMode, DarkThemeVar, LightThemeVar } from './themes'
import type { UiPrefs } from './preferences'
import type { RotationEditorPreferences } from './rotationEditorPreferences'

export type ThemeMode = 'light' | 'dark' | 'background'
export type ThemePref = 'system' | ThemeMode
export const HIST_MAX_OPTS = [5, 10, 25, 50, 75, 100] as const
export type HistoryMax = typeof HIST_MAX_OPTS[number]
export const PICK_FREQ_WEPS = [
  'broadblade',
  'sword',
  'pistols',
  'gauntlets',
  'rectifier',
] as const
export type PickFreqWeapon = typeof PICK_FREQ_WEPS[number]
export const PICK_FREQ_TEAM = ['active', 'teammate1', 'teammate2'] as const
export type PckrFreqTeam = typeof PICK_FREQ_TEAM[number]

export interface PckrFreqItmS {
  id: string
  count: number
  firstUsedAt: string | null
  lastUsedAt: string | null
  previousUsedAt: string | null
  firstUseSeq: number
  lastUseSeq: number
  usesByDay: Record<string, number>
  firstActiveResonatorId: string | null
  lastActiveResonatorId: string | null
  previousActiveResonatorId: string | null
  usesByActiveResonator: Record<string, number>
}

export interface PckrFreqBktS {
  version: 2
  totalUses: number
  firstUsedAt: string | null
  lastUsedAt: string | null
  order: string[]
  items: Record<string, PckrFreqItmS>
}

export interface PckrFreqStt {
  resonator: PckrFreqBktS
  echo: PckrFreqBktS
  enemy: PckrFreqBktS
  weaponByType: Record<PickFreqWeapon, PckrFreqBktS>
  resonatorByTeamSlot: Record<PckrFreqTeam, PckrFreqBktS>
}

export type PckrFreqUpd =
  | {
    bucket: 'resonator' | 'echo' | 'enemy'
    ids: string[]
    activeResonatorId?: string | null
  }
  | {
    bucket: 'weapon'
    weaponType: PickFreqWeapon
    ids: string[]
    activeResonatorId?: string | null
  }
  | {
    bucket: 'teamResonator'
    slot: PckrFreqTeam
    ids: string[]
    activeResonatorId?: string | null
  }

export interface UiState {
  theme: ThemeMode
  themePreference: ThemePref
  lightVariant: LightThemeVar
  darkVariant: DarkThemeVar
  backgroundVariant: BgThemeVar
  backgroundImageKey: string
  backgroundTextMode: 'light' | 'dark'
  bodyFontName: string
  bodyFontUrl: string
  blurMode: BlurMode
  entranceAnimations: boolean
  preferences: UiPrefs
  suggsViewMode: SuggsViewMod
  showSubHits: boolean
  compactInv: boolean
  seeEquipped: boolean
  haveHistory: boolean
  historyMax: HistoryMax
  itemFreq: PckrFreqStt
  optimizerCpuHintSeen: boolean
  compressedExports: boolean
  groupInv: boolean
  rotationEditorPreferences: RotationEditorPreferences
  savedRotationPreferences: {
    sortBy: 'date' | 'name' | 'avg' | 'dps'
    sortOrder: 'asc' | 'desc'
    contributionFilter: 'unset' | 'solo' | 'duo' | 'trio'
    autoSearchActiveResonator: boolean
    showLiveRotation: boolean
    scaleToSelected: boolean
  }
}

/** stored ui slice: the keys hydration rebuilds are optional here. */
export type StoredUiState = Omit<
  UiState,
  | 'themePreference'
  | 'historyMax'
  | 'itemFreq'
  | 'preferences'
  | 'suggsViewMode'
  | 'rotationEditorPreferences'
> & {
  themePreference?: UiState['themePreference']
  historyMax?: UiState['historyMax']
  itemFreq?: UiState['itemFreq']
  preferences?: UiState['preferences']
  suggsViewMode?: UiState['suggsViewMode']
  rotationEditorPreferences?: UiState['rotationEditorPreferences']
}
