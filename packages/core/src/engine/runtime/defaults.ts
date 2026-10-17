/*
  Author: Runor Ewhro
  description: provides default state factories and initialization helpers for
               resonators, teams, optimizer settings, and persisted app state.
*/

import {
  NONE_ENEMY_ID,
  type LegacyProfileMap,
  type EnemyProfile,
} from '@core/domain/entities/appState'
import type {
  OptSets,
} from '@core/domain/entities/optimizer'
import type {
  CombatSession,
} from '@core/domain/entities/session'
import {
  cloneSntSet,
  DEF_SET_COND,
} from '@core/domain/entities/sonataSetConditionals'
import type {
  RandGnrtSets,
  SuggestState,
  SuggSets,
  WeaponPlanSet,
} from '@core/domain/entities/suggestions'
import {
  DEF_ENEMY_ID,
  DEF_ENEMY_PROF,
} from '@core/domain/entities/enemy'
import type {
  ResRuntime,
  ResSeed,
  SkillLevels,
  TraceNodeBuffs,
  CombatState,
  RotationState,
  TeamSlots,
  TeamMemRt,
  TeamMemRtVie,
  WeaponState,
} from '@core/domain/entities/runtime'
import type {
  ResProf,
  SlotLocalState,
  SlotRatingState,
} from '@core/domain/entities/profile'
import {
  combatScenarioId,
  makeScenarioTeam,
  teamMemberId,
  type CombatScenario,
  type ScenarioTargetRouting,
  type ScenarioTeamMember,
  type TeamMemberId,
} from '@core/domain/entities/combatScenario'
import {
  cloneOptInventorySelection,
  makeOptInventorySelection,
} from '@core/domain/entities/profile'
import {
  makeCombatEnvironment,
  makeMemberManualEffect,
} from '@core/engine/runtime/scenarioEnvironment'


import type {
  ManualBuffs,
  MnlMod,
  QuickBuffs,
} from '@core/domain/entities/manualBuffs'
import {
  NONE_WPN_ID,
} from '@core/domain/entities/runtime'
import type {
  AttributeKey,
  BaseStatBuff,
  ModBuff,
} from '@core/domain/entities/stats'
import {
  getResSeedBy,
  listResSds,
} from '@core/data/catalog/resonatorSeedService'
import {
  getWpnById,
  listWpnsByTy,
} from '@core/data/catalog/weaponCatalogService'
import {
  writeRtPath,
} from '@core/domain/gameData/runtimePath'
import {
  maxRuntime,
} from '@core/engine/runtime/maxRuntime'
import {
  initWpnStts,
} from '@core/engine/runtime/sourceStateInit'
import {
  mkMaxTrcNode,
} from '@core/engine/runtime/traceNodes'
import {
  getGameData,
} from '@core/data/gameData'
import {
  getDefaultRotation,
  listStatesFor,
} from '@core/data/catalog/gameDataService'
import {
  makeSourceKey,
} from '@core/data/gameData/registry'
import {
  splitScopedTargetOwnerKey,
} from '@core/domain/gameData/targetRouting'
import {
  cloneEnemyPr,
  cloneBuffs,
  cloneRotation,
  cloneSkllLvl,
  cloneTrcNode,
  cloneWpnMkSt,
} from '@core/engine/runtime/runtimeCloning'
import {
  catTmWpnAtk,
  catWpnAtk,
} from '@core/engine/runtime/weaponState'
import {
  repairEchoLoadoutForCatalog,
} from '@core/engine/runtime/echoCatalogRepair'
import {
  allOptSetIds,
  normOptSets,
} from '@core/engine/optimizer/config/allowedSets'

import {
  DEF_RES_ID,
} from '@core/data/gameData/constants'
export { DEF_RES_ID } from '@core/data/gameData/constants'

export const MAX_RES_LVL = 90
export const MAX_SKILL_LEVEL = 10
export const MAX_WPN_LVL = 90

export function getFallbackSeed(): ResSeed {
  const seed = getResSeedBy(DEF_RES_ID) ?? listResSds()[0]
  if (!seed) {
    throw new Error('Cannot initialize Simulation state without resonator game data.')
  }

  return seed
}

function hasSource(type: 'resonator' | 'weapon' | 'echo' | 'echoSet' | 'enemy', id: string | number | null | undefined): boolean {
  if (id == null || id === '') {
    return false
  }

  try {
    return Boolean(getGameData().sourcesByKey[makeSourceKey({ type, id: String(id) })])
  } catch {
    return false
  }
}


const ttrbKeys: AttributeKey[] = [
  'aero',
  'glacio',
  'spectro',
  'fusion',
  'electro',
  'havoc',
  'physical',
]

export function makeBaseBuff(): BaseStatBuff {
  return { percent: 0, flat: 0 }
}

export function makeModBuff(): ModBuff {
  return {
    resShred: 0,
    dmgBonus: 0,
    amplify: 0,
    defIgnore: 0,
    defShred: 0,
    dmgVuln: 0,
    critRate: 0,
    critDmg: 0,
  }
}

export function mkDefSkllLvl(): SkillLevels {
  return {
    normalAttack: 1,
    resonanceSkill: 1,
    forteCircuit: 1,
    resonanceLiberation: 1,
    introSkill: 1,
    tuneBreak: 1,
  }
}

export function mkMaxSkllLvl(): SkillLevels {
  return {
    normalAttack: MAX_SKILL_LEVEL,
    resonanceSkill: MAX_SKILL_LEVEL,
    forteCircuit: MAX_SKILL_LEVEL,
    resonanceLiberation: MAX_SKILL_LEVEL,
    introSkill: MAX_SKILL_LEVEL,
    tuneBreak: MAX_SKILL_LEVEL,
  }
}

export function makeTraceNode(): TraceNodeBuffs {
  return {
    atk: makeBaseBuff(),
    hp: makeBaseBuff(),
    def: makeBaseBuff(),
    attribute: Object.fromEntries(ttrbKeys.map((key) => [key, makeModBuff()])) as Record<
        AttributeKey,
        ModBuff
    >,
    critRate: 0,
    critDmg: 0,
    healingBonus: 0,
    activeNodes: {},
  }
}

export function mkDefMnlQckB(): QuickBuffs {
  return {
    atk: { flat: 0, percent: 0 },
    hp: { flat: 0, percent: 0 },
    def: { flat: 0, percent: 0 },
    critRate: 0,
    critDmg: 0,
    energyRegen: 0,
    healingBonus: 0,
  }
}

export function mkDefMnlMod(
    id: string,
    scope: MnlMod['scope'] = 'topStat',
): MnlMod {
  switch (scope) {
    case 'baseStat':
      return {
        id,
        enabled: true,
        scope,
        stat: 'atk',
        field: 'percent',
        value: 0,
      }
    case 'attribute':
      return {
        id,
        enabled: true,
        scope,
        attribute: 'all',
        mod: 'dmgBonus',
        value: 0,
      }
    case 'skillType':
      return {
        id,
        enabled: true,
        scope,
        skillType: 'all',
        mod: 'dmgBonus',
        value: 0,
      }
    case 'negativeEffect':
      return {
        id,
        enabled: true,
        scope,
        negativeEffect: 'spectroFrazzle',
        mod: 'critRate',
        value: 0,
      }
    case 'skill':
      return {
        id,
        enabled: true,
        scope,
        matchMode: 'skillId',
        skillId: '',
        effect: 'mod',
        mod: 'dmgBonus',
        value: 0,
      }
    case 'topStat':
    default:
      return {
        id,
        enabled: true,
        scope: 'topStat',
        stat: 'dmgBonus',
        value: 0,
      }
  }
}

export function makeCustomBuff(): ManualBuffs {
  return {
    quick: mkDefMnlQckB(),
    modifiers: [],
  }
}

export function makeCombatState(): CombatState {
  return {
    spectroFrazzle: 0,
    aeroErosion: 0,
    fusionBurst: 0,
    havocBane: 0,
    glacioChafe: 0,
    electroFlare: 0,
    electroRage: 0,
  }
}

export function makeOptSets(): OptSets {
  const allSetIds = allOptSetIds()

  return {
    targetSkillId: null,
    targetMode: 'skill',
    targetComboSourceId: null,
    rotationMode: false,
    searchMode: 'inventory',
    resultsLimit: 128,
    keepPercent: 0,
    lowMemoryMode: false,
    enableGpu: true,
    lockedMainEchoId: null,
    allowedSets: {
      1: [...allSetIds[1]],
      3: [...allSetIds[3]],
      5: [...allSetIds[5]],
    },
    mainStatFilter: [],
    selectedBonus: null,
    excludeEquipped: false,
    includeWeapons: false,
    statConstraints: {},
  }
}

export function mkDefSuggSet(): SuggSets {
  return {
    targetFeatureId: null,
    rotationMode: false,
  }
}

export function mkDefRandGnr(): RandGnrtSets {
  return {
    bias: 0.5,
    rollQuality: 0.3,
    targetEnergyRegen: 0,
    setPreferences: [],
    mainEchoId: null,
  }
}

export function mkDefWpnSug(): WeaponPlanSet {
  return {
    mode: 'both',
    target: 'max',
    ranks: {
      '5': 1,
      '4': 5,
      '3': 5,
      '2': 5,
      '1': 5,
    },
    stdRank: 1,
    visible: {
      '5': true,
      '4': true,
      '3': false,
      '2': false,
      '1': false,
    },
    states: {},
  }
}

export function makeSuggest(): SuggestState {
  return {
    settings: mkDefSuggSet(),
    random: mkDefRandGnr(),
  }
}

export function cloneOptSets(
    settings?: Partial<OptSets> | null,
): OptSets {
  const defaults = makeOptSets()
  const allowedSets = normOptSets({
    1: [...(settings?.allowedSets?.[1] ?? defaults.allowedSets[1])],
    3: [...(settings?.allowedSets?.[3] ?? defaults.allowedSets[3])],
    5: [...(settings?.allowedSets?.[5] ?? defaults.allowedSets[5])],
  })

  return {
    ...defaults,
    ...(settings ?? {}),
    allowedSets,
    mainStatFilter: [...(settings?.mainStatFilter ?? defaults.mainStatFilter)],
    statConstraints: structuredClone(settings?.statConstraints ?? defaults.statConstraints),
  }
}

export function normWeaponForSeed(
    seed: Pick<ResSeed, 'defaultWeaponId' | 'weaponType'>,
    weapon: Pick<WeaponState, 'id' | 'level' | 'rank'>,
): WeaponState {
  return weapon.id && getWpnById(weapon.id)
    ? catWpnAtk(weapon)
    : mkDefSeedWpnMkSt(seed)
}



function isKnownCombatTarget(enemy: EnemyProfile): boolean {
  if (!enemy.id) {
    return false
  }

  // custom targets and default placeholders are scenario identities without
  // effect source packages.
  if (
    enemy.source === 'custom'
    || enemy.id === NONE_ENEMY_ID
    || enemy.id === DEF_ENEMY_ID
  ) {
    return true
  }

  if (hasSource('enemy', enemy.id)) {
    return true
  }

  // most catalog enemies have no effect package, so sourcesByKey cannot be
  // used as catalog membership. preserve numeric catalog ids and drop the
  // obviously unknown ones used by cross-catalog repair.
  return enemy.source === 'catalog' && /^\d+$/.test(enemy.id)
}

export function normEnemyForCatalog(enemy: EnemyProfile | undefined): EnemyProfile {
  if (!enemy || !isKnownCombatTarget(enemy)) {
    return makeEnemy()
  }

  return cloneEnemyPr(enemy)
}




export function mkDefWpnMkSt(weaponType?: number): WeaponState {
  if (weaponType !== undefined) {
    const weapons = listWpnsByTy(weaponType)
    if (weapons.length > 0) {
      const first = weapons[0]
      const stats = first.statsByLevel[1]

      return {
        id: first.id,
        level: 1,
        rank: 1,
        baseAtk: stats ? stats.atk : first.baseAtk,
      }
    }
  }

  return {
    id: NONE_WPN_ID,
    level: 1,
    rank: 1,
    baseAtk: 0,
  }
}

export function mkDefSeedWpnMkSt(seed: Pick<ResSeed, 'defaultWeaponId' | 'weaponType'>): WeaponState {
  if (seed.defaultWeaponId) {
    return catWpnAtk({
      id: seed.defaultWeaponId,
      level: 1,
      rank: 1,
    })
  }

  return mkDefWpnMkSt(seed.weaponType)
}

export function mkMaxWpnMkSt(
    id: string | null = NONE_WPN_ID,
    rank = 1,
): WeaponState {
  return catWpnAtk({
    id,
    level: MAX_WPN_LVL,
    rank,
  })
}

export function mkDefTeamSlt(seed: ResSeed): TeamSlots {
  return [seed.id, null, null]
}

export function mkDefSlotLcl(): SlotLocalState {
  return {
    controls: {},
    manualBuffs: makeCustomBuff(),
    combat: makeCombatState(),
    setConditionals: cloneSntSet(DEF_SET_COND),
    optimizerInventory: makeOptInventorySelection(),
  }
}

export function mkDefSlotRtn(): SlotRatingState {
  return {
    selectedTargetsByOwnerKey: {},
  }
}

export function makeEnemy(): EnemyProfile {
  return cloneEnemyPr(DEF_ENEMY_PROF)
}

function getSeedStts(seed: ResSeed) {
  if (seed.states?.length) {
    return seed.states
  }

  return listStatesFor('resonator', seed.id)
}

export function mkDefRot(seed: ResSeed): RotationState {
  const defRot = seed.rotations?.find((rotation) => rotation.items.length > 0)
    ?? getDefaultRotation(seed.id)
  const defaultItems = defRot?.items ?? []

  return cloneRotation({
    sequence: defaultItems,
    program: defaultItems,
    lastRanAt: null,
  })
}

export function makeResProfile(seed: ResSeed, options: { maxed?: boolean } = {}): ResProf {
  if (options.maxed) {
    const runtime = mkMaxResRt(seed)

    return {
      resonatorId: seed.id,
      runtime: {
        progression: {
          level: runtime.base.level,
          sequence: runtime.base.sequence,
          skillLevels: cloneSkllLvl(runtime.base.skillLevels),
          traceNodes: cloneTrcNode(runtime.base.traceNodes),
        },
        build: {
          weapon: cloneWpnMkSt(runtime.build.weapon),
          echoes: [...runtime.build.echoes],
        },
        local: {
          controls: { ...runtime.state.controls },
          manualBuffs: cloneBuffs(runtime.state.manualBuffs),
          combat: { ...runtime.state.combat },
          setConditionals: cloneSntSet(DEF_SET_COND),
          optimizerInventory: makeOptInventorySelection(),
        },
        routing: mkDefSlotRtn(),
        team: runtime.build.team,
        rotation: cloneRotation(runtime.rotation),
        teamRuntimes: runtime.teamRuntimes,
      },
    }
  }

  return {
    resonatorId: seed.id,
    runtime: {
      progression: {
        level: 1,
        sequence: 0,
        skillLevels: mkDefSkllLvl(),
        traceNodes: makeTraceNode(),
      },
      build: {
        weapon: mkDefSeedWpnMkSt(seed),
        echoes: [null, null, null, null, null],
      },
      local: applySeedStt(seed, mkDefSlotLcl()),
      routing: mkDefSlotRtn(),
      team: mkDefTeamSlt(seed),
      rotation: mkDefRot(seed),
      teamRuntimes: [null, null],
    },
  }
}

function applySttDflt(seed: ResSeed, runtime: ResRuntime): ResRuntime {
  return getSeedStts(seed).reduce((nextRuntime, state) => {
    if (state.defaultValue === undefined) {
      return nextRuntime
    }

    return writeRtPath(nextRuntime, state.path, state.defaultValue)
  }, runtime)
}

export function applySeedStt(
    seed: ResSeed,
    localState: SlotLocalState,
): SlotLocalState {
  const nextLclStt: SlotLocalState = {
    controls: { ...localState.controls },
    manualBuffs: cloneBuffs(localState.manualBuffs),
    combat: { ...localState.combat },
    setConditionals: cloneSntSet(localState.setConditionals),
    optimizerInventory: cloneOptInventorySelection(localState.optimizerInventory),
  }

  for (const state of getSeedStts(seed)) {
    if (state.defaultValue === undefined) {
      continue
    }

    if (state.path.startsWith('runtime.state.controls.')) {
      const controlKey = state.path.replace(/^runtime\.state\.controls\./, '')
      nextLclStt.controls[controlKey] = state.defaultValue
    }
  }

  return nextLclStt
}

export function cloneSlotRml(routing?: SlotRatingState): SlotRatingState {
  return {
    selectedTargetsByOwnerKey: {
      ...(routing?.selectedTargetsByOwnerKey ?? {}),
    },
  }
}

export function normProfTeam(
    actResId: string,
    team: TeamSlots,
): TeamSlots {
  const nextTeam1Id = team[1] && team[1] !== actResId && getResSeedBy(team[1]) ? team[1] : null
  const nextTeam2Cand = team[2] && team[2] !== actResId && getResSeedBy(team[2]) ? team[2] : null
  const nextTeam2Id = nextTeam2Cand && nextTeam2Cand !== nextTeam1Id ? nextTeam2Cand : null

  return [actResId, nextTeam1Id, nextTeam2Id]
}

function applyTeamMem(seed: ResSeed, runtime: TeamMemRtVie): TeamMemRtVie {
  return getSeedStts(seed).reduce((nextRuntime, state) => {
    if (state.defaultValue === undefined) {
      return nextRuntime
    }

    return writeRtPath(
        nextRuntime as unknown as ResRuntime,
        state.path,
        state.defaultValue,
    ) as unknown as TeamMemRtVie
  }, runtime)
}

export function makeResRuntime(seed: ResSeed): ResRuntime {
  const baseRuntime: ResRuntime = {
    id: seed.id,
    base: {
      level: 1,
      sequence: 0,
      skillLevels: mkDefSkllLvl(),
      traceNodes: makeTraceNode(),
    },
    build: {
      weapon: mkDefSeedWpnMkSt(seed),
      echoes: [null, null, null, null, null],
      team: mkDefTeamSlt(seed),
    },
    state: {
      controls: {},
      manualBuffs: makeCustomBuff(),
      combat: makeCombatState(),
      teamEffects: { unisonBoon: 0, unisonBoonMax: 2, unisonBoonPerStack: 3 },
    },
    rotation: mkDefRot(seed),
    teamRuntimes: [null, null],
  }

  return initWpnStts(applySttDflt(seed, baseRuntime), {
    maxed: false,
  })
}

export function mkMaxResRt(seed: ResSeed, targetSequence = 0): ResRuntime {
  return maxRtInit(makeResRuntime(seed), targetSequence)
}

export function maxRtInit(runtime: ResRuntime, targetSequence = 0): ResRuntime {
  return maxRuntime(runtime, targetSequence)
}

export function mkDefTeamMem(seed: ResSeed): TeamMemRtVie {
  const baseRuntime: TeamMemRtVie = {
    id: seed.id,
    base: {
      sequence: 0,
    },
    build: {
      weapon: catTmWpnAtk(mkDefSeedWpnMkSt(seed), MAX_WPN_LVL),
      echoes: [null, null, null, null, null],
    },
    state: {
      controls: {},
      manualBuffs: makeCustomBuff(),
      combat: makeCombatState(),
    },
  }

  return applyTeamMem(seed, baseRuntime)
}

export function makeTeamMember(seed: ResSeed): TeamMemRt {
  const weapon = mkDefSeedWpnMkSt(seed)

  return {
    id: seed.id,
    base: {
      sequence: 0,
    },
    build: {
      weapon: catTmWpnAtk(weapon, MAX_WPN_LVL),
      echoes: [null, null, null, null, null],
    },
    manualBuffs: makeCustomBuff(),
  }
}

export function matTeamMemRt(
    seed: ResSeed,
    teamMember: TeamMemRtVie,
    team: TeamSlots,
): ResRuntime {
  return {
    id: teamMember.id,
    base: {
      level: MAX_RES_LVL,
      sequence: teamMember.base.sequence,
      skillLevels: mkMaxSkllLvl(),
      traceNodes: mkMaxTrcNode(seed),
    },
    build: {
      weapon: mkMaxWpnMkSt(teamMember.build.weapon.id, teamMember.build.weapon.rank),
      echoes: teamMember.build.echoes,
      team,
    },
    state: {
      controls: { ...teamMember.state.controls },
      manualBuffs: cloneBuffs(teamMember.state.manualBuffs),
      combat: { ...teamMember.state.combat },
    },
    rotation: mkDefRot(seed),
    teamRuntimes: [null, null],
  }
}


function legacyMemberControls(
  controls: Record<string, boolean | number | string>,
  resonatorId: string,
  primary: boolean,
): Record<string, boolean | number | string> {
  if (primary) {
    const ownTeamPrefix = `team:${resonatorId}:`
    return Object.fromEntries(
      Object.entries(controls).filter(([key]) => (
        !key.startsWith('team:') || key.startsWith(ownTeamPrefix)
      )),
    )
  }

  const prefix = `team:${resonatorId}:`
  return Object.fromEntries(
    Object.entries(controls)
      .filter(([key]) => key.startsWith(prefix) && !key.startsWith(`${prefix}__mb:`))
      .map(([key, value]) => [key.slice(prefix.length), value]),
  )
}

function profileScenarioMember(
  profile: ResProf,
  controls: Record<string, boolean | number | string>,
): ScenarioTeamMember {
  const seed = getResSeedBy(profile.resonatorId)
  return {
    id: teamMemberId(profile.resonatorId),
    resonatorId: profile.resonatorId,
    progression: {
      level: profile.runtime.progression.level,
      sequence: profile.runtime.progression.sequence,
      skillLevels: cloneSkllLvl(profile.runtime.progression.skillLevels),
      traceNodes: cloneTrcNode(profile.runtime.progression.traceNodes),
    },
    loadout: {
      weapon: seed
        ? normWeaponForSeed(seed, profile.runtime.build.weapon)
        : cloneWpnMkSt(profile.runtime.build.weapon),
      echoes: repairEchoLoadoutForCatalog(profile.runtime.build.echoes),
    },
    local: {
      controls,
      setConditionals: cloneSntSet(profile.runtime.local.setConditionals),
      optimizerInventory: cloneOptInventorySelection(profile.runtime.local.optimizerInventory),
    },
  }
}

export function makeScenarioMemberFromProfile(profile: ResProf): ScenarioTeamMember {
  return profileScenarioMember(
    profile,
    legacyMemberControls(profile.runtime.local.controls, profile.resonatorId, true),
  )
}

function compactScenarioMember(
  compact: TeamMemRt,
  activeProfile: ResProf,
): ScenarioTeamMember | null {
  const seed = getResSeedBy(compact.id)
  if (!seed) return null

  const weapon = compact.build.weapon.id && getWpnById(compact.build.weapon.id)
    ? compact.build.weapon
    : mkDefSeedWpnMkSt(seed)

  return {
    id: teamMemberId(seed.id),
    resonatorId: seed.id,
    progression: {
      level: MAX_RES_LVL,
      sequence: compact.base.sequence,
      skillLevels: mkMaxSkllLvl(),
      traceNodes: mkMaxTrcNode(seed),
    },
    loadout: {
      weapon: {
        ...catTmWpnAtk(weapon, MAX_WPN_LVL),
        level: MAX_WPN_LVL,
      },
      echoes: repairEchoLoadoutForCatalog(compact.build.echoes),
    },
    local: {
      controls: legacyMemberControls(activeProfile.runtime.local.controls, seed.id, false),
      setConditionals: cloneSntSet(DEF_SET_COND),
      optimizerInventory: makeOptInventorySelection(),
    },
  }
}

function legacyScenarioRouting(
  profile: ResProf,
  members: readonly ScenarioTeamMember[],
): ScenarioTargetRouting {
  const primary = members[0]
  const memberByResonatorId = new Map(
    members.map((member) => [member.resonatorId, member]),
  )
  const bySourceMemberId = Object.fromEntries(
    members.map((member) => [member.id, {}]),
  ) as Record<TeamMemberId, Record<string, TeamMemberId | null>>

  for (const [routeKey, targetResonatorId] of Object.entries(
    profile.runtime.routing.selectedTargetsByOwnerKey,
  )) {
    const split = splitScopedTargetOwnerKey(routeKey)
    const source = split.sourceRuntimeId
      ? memberByResonatorId.get(split.sourceRuntimeId)
      : primary
    if (!source) continue
    const target = targetResonatorId
      ? memberByResonatorId.get(targetResonatorId) ?? null
      : null
    if (targetResonatorId && !target) continue
    bySourceMemberId[source.id][split.ownerKey] = target?.id ?? null
  }

  return { bySourceMemberId }
}

export function makeScenarioFromProfiles(
  profiles: LegacyProfileMap,
  session: CombatSession | null | undefined,
  revision: number,
  activeOverride?: string | null,
): CombatScenario {
  const fallbackSeed = getFallbackSeed()
  const requestedActive = activeOverride ?? session?.activeResonatorId
  const activeId = requestedActive && profiles[requestedActive] && getResSeedBy(requestedActive)
    ? requestedActive
    : Object.keys(profiles).find((id) => Boolean(getResSeedBy(id))) ?? fallbackSeed.id
  const activeProfile = profiles[activeId]
    ?? makeResProfile(getResSeedBy(activeId) ?? fallbackSeed)
  const primary = profileScenarioMember(
    activeProfile,
    legacyMemberControls(activeProfile.runtime.local.controls, activeProfile.resonatorId, true),
  )
  const members = [
    primary,
    ...activeProfile.runtime.teamRuntimes.flatMap((compact) => {
      if (!compact || compact.id === primary.resonatorId) return []
      const member = compactScenarioMember(compact, activeProfile)
      return member ? [member] : []
    }),
  ].slice(0, 3)
  const team = makeScenarioTeam(members)
  const manualBuffsByResonatorId = new Map<string, ManualBuffs>([
    [activeProfile.resonatorId, activeProfile.runtime.local.manualBuffs],
    ...activeProfile.runtime.teamRuntimes.flatMap((compact) => compact
      ? [[compact.id, compact.manualBuffs ?? makeCustomBuff()] as const]
      : []),
  ])
  const routing = legacyScenarioRouting(activeProfile, team.members)

  return {
    id: combatScenarioId('workspace'),
    revision,
    team,
    contextMemberId: team.members[0].id,
    target: normEnemyForCatalog(session?.enemyProfile ?? makeEnemy()),
    environment: makeCombatEnvironment(
      activeProfile.runtime.local.combat,
      routing,
      team.members.map((member) => makeMemberManualEffect(
        member.id,
        manualBuffsByResonatorId.get(member.resonatorId) ?? makeCustomBuff(),
      )),
    ),
    program: cloneRotation(activeProfile.runtime.rotation),
    initialOnFieldMemberId: team.members[0].id,
  }
}
