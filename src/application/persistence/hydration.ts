/*
  Author: Runor Ewhro
  description: hydrates the stored calculation document: fills retired defaults,
               normalizes legacy slices, and rebuilds the workspace.
*/

import { type HydratedAppState, type PersistedState, type LegacyProfileMap, type SimulationState } from '@wuwacalc/core/domain/entities/appState'
import { type SavedEcho, type SavedBuild, type SavedRotation, type SavedScenario, type SavedArtifactLibrary, cloneRotationNodes, dedupeEchoUids, getEchoSignature, normalizeDuration, normalizeRotNote } from '@wuwacalc/core/domain/entities/inventoryStorage'
import type { OptSets } from '@wuwacalc/core/domain/entities/optimizer'
import type { CombatSession } from '@wuwacalc/core/domain/entities/session'
import { cloneSntSet } from '@wuwacalc/core/domain/entities/sonataSetConditionals'
import type { WeaponPlanSet } from '@wuwacalc/core/domain/entities/suggestions'
import type { ResRuntime, ResSeed, RotationState, TeamSlots, TeamMemRt, TeamMemWpnVi, WeaponState, EchoInstance } from '@wuwacalc/core/domain/entities/runtime'
import { type ResProf, type SlotLocalState, cloneOptInventorySelection } from '@wuwacalc/core/domain/entities/profile'
import { combatScenarioId, contextScenarioMember, makeScenarioTeam, teamMemberId, type CombatScenario, type EnvironmentManualEffect, type ScenarioTeamMember, type TeamMemberId } from '@wuwacalc/core/domain/entities/combatScenario'
import { scenarioIdForContextResonator, type ScenarioWorkspace } from '@wuwacalc/core/domain/entities/scenarioLibrary'
import { getResSeedBy } from '@wuwacalc/core/data/catalog/resonatorSeedService'
import { getWpnById } from '@wuwacalc/core/data/catalog/weaponCatalogService'
import type { RotationNode } from '@wuwacalc/core/domain/gameData/contracts'
import { migrateLegacyRotationItems } from '@wuwacalc/core/domain/gameData/loopPasses'
import { normalizeFeatureAttachments, stripFeatureAttachments } from '@wuwacalc/core/domain/gameData/rotationAttached'
import { normResRtCnt } from '@wuwacalc/core/engine/gameData/controlOptions'
import { normNegFfctC } from '@wuwacalc/core/engine/gameData/negativeEffects'
import { mkMaxTrcNode } from '@wuwacalc/core/engine/runtime/traceNodes'
import { getKnownFeatureIds } from '@wuwacalc/core/data/gameData'
import { getDefaultRotation } from '@wuwacalc/core/data/catalog/gameDataService'
import { isRotationSequence } from '@wuwacalc/core/domain/gameData/rotationSequence'
import { cloneBuffs, cloneRotation, cloneSkllLvl, cloneTrcNode } from '@wuwacalc/core/engine/runtime/runtimeCloning'
import { catTmWpnAtk, catWpnAtk } from '@wuwacalc/core/engine/runtime/weaponState'
import { APP_STATE_VER } from '@wuwacalc/core/domain/entities/appStateVersion'
import { repairEchoLoadoutForCatalog, repairSavedEchoForCatalog } from '@wuwacalc/core/engine/runtime/echoCatalogRepair'
import { MAX_RES_LVL, MAX_WPN_LVL, getFallbackSeed, mkMaxSkllLvl, makeCustomBuff, mkDefWpnSug, cloneOptSets, normWeaponForSeed, normEnemyForCatalog, mkDefRot, makeResProfile, cloneSlotRml, normProfTeam, makeScenarioFromProfiles } from '@wuwacalc/core/engine/runtime/defaults'

type LegacyCombatWorkspace = {
  currentScenario?: CombatScenario
}

type LegacyScenarioDocument = {
  id?: string
  name?: string
  createdAt?: number
  updatedAt?: number
  scenario: CombatScenario
}

type UnknownCombatWorkspace = Partial<ScenarioWorkspace> & {
  scenario?: CombatScenario
  documentsById?: Record<string, LegacyScenarioDocument>
}

type LegacyCalculatorState = Partial<SimulationState> & {
  runtimeRevision?: number
  profiles?: LegacyProfileMap
  inventoryEchoes?: SavedEcho[]
  inventoryBuilds?: SavedBuild[]
  inventoryRotations?: SavedRotation[]
  session?: CombatSession
  workspace?: LegacyCombatWorkspace
  optimizerContext?: {
    resonatorId?: string | null
    settings?: Partial<OptSets> | null
  } | null
}

/** stored state before hydration: every calculation slice optional and legacies allowed. */
export type PersistedUnknown = Omit<PersistedState, 'version' | 'simulation' | 'combat' | 'library'> & {
  version: number
  combat?: UnknownCombatWorkspace
  library?: Partial<SavedArtifactLibrary>
  simulation: LegacyCalculatorState
}

function preserveWeaponForSeed(
    seed: Pick<ResSeed, 'defaultWeaponId' | 'weaponType'> | null,
    weapon: Pick<WeaponState, 'id' | 'level' | 'rank'> & Partial<Pick<WeaponState, 'baseAtk'>>,
): WeaponState {
  if (seed && weapon.id && getWpnById(weapon.id)) {
    return catWpnAtk(weapon)
  }

  return {
    id: weapon.id,
    level: weapon.level,
    rank: weapon.rank,
    baseAtk: weapon.baseAtk ?? 0,
  }
}

function preserveTeamWeaponForSeed(
    seed: Pick<ResSeed, 'defaultWeaponId' | 'weaponType'> | null,
    weapon: Pick<TeamMemWpnVi, 'id' | 'rank'> & Partial<Pick<TeamMemWpnVi, 'baseAtk'>>,
): TeamMemWpnVi {
  if (seed && weapon.id && getWpnById(weapon.id)) {
    return catTmWpnAtk(weapon, MAX_WPN_LVL)
  }

  return {
    id: weapon.id,
    rank: weapon.rank,
    baseAtk: weapon.baseAtk ?? 0,
  }
}

function normRotationForCatalog(rotation: RotationState, resonatorId: string): RotationState {
  const featureIds = getCatalogFeatureIds()
  const previousSequence = normFeatureNodesForCatalog(
    migrateLegacyRotationItems(rotation.sequence), featureIds,
  )
  const defaultSequence = getDefaultRotation(resonatorId)?.items ?? []
  return {
    ...rotation,
    // preserve only legacy advanced content until it can be archived. compact
    // manual sequences no longer participate in or persist with a scenario.
    sequence: previousSequence.length > 0 && !isRotationSequence(previousSequence, resonatorId)
      ? previousSequence
      : cloneRotationNodes(defaultSequence),
    program: normFeatureNodesForCatalog(migrateLegacyRotationItems(rotation.program), featureIds),
  }
}

function relinkEquippedEchoUids(
    profiles: LegacyProfileMap,
    inventoryEchoes: SavedEcho[],
): LegacyProfileMap {
  if (inventoryEchoes.length === 0) {
    return profiles
  }

  const invByUid = new Map<string, EchoInstance>()
  const invBySig = new Map<string, EchoInstance>()
  for (const entry of inventoryEchoes) {
    invByUid.set(entry.echo.uid, entry.echo)
    const sig = getEchoSignature(entry.echo)
    if (!invBySig.has(sig)) {
      invBySig.set(sig, entry.echo)
    }
  }

  let changed = false
  const nextProfiles = Object.fromEntries(
      Object.entries(profiles).map(([resonatorId, profile]) => {
        let profileChanged = false
        const nextEchoes = profile.runtime.build.echoes.map((echo) => {
          if (!echo) {
            return echo
          }

          const sig = getEchoSignature(echo)
          const currentInvEcho = invByUid.get(echo.uid)
          if (currentInvEcho && getEchoSignature(currentInvEcho) === sig) {
            return echo
          }

          const exactInvEcho = invBySig.get(sig)
          if (!exactInvEcho || exactInvEcho.uid === echo.uid) {
            return echo
          }

          profileChanged = true
          changed = true
          return { ...echo, uid: exactInvEcho.uid }
        })

        if (!profileChanged) {
          return [resonatorId, profile]
        }

        return [
          resonatorId,
          {
            ...profile,
            runtime: {
              ...profile.runtime,
              build: {
                ...profile.runtime.build,
                echoes: nextEchoes,
              },
            },
          },
        ]
      }),
  )

  return changed ? nextProfiles : profiles
}

function getCatalogFeatureIds(): ReadonlySet<string> {
  try {
    return getKnownFeatureIds()
  } catch {
    return new Set()
  }
}

function normFeatureNodesForCatalog(
  nodes: RotationNode[],
  featureIds: ReadonlySet<string>,
): RotationNode[] {
  const hasFeatureId = (featureId: string): boolean => featureIds.has(featureId)
  const next: RotationNode[] = []

  for (const node of nodes) {
    if (node.type === 'feature') {
      if (!hasFeatureId(node.featureId)) {
        continue
      }
      const attachedFeatures = (node.attached?.features ?? [])
        .filter((feature) => feature.type === 'feature' && hasFeatureId(feature.featureId))
        .map(stripFeatureAttachments)
      const attachedConditions = (node.attached?.conditions ?? [])
        .filter((condition) => condition.type === 'condition')
      const sanitized = node.attached
        ? {
          ...node,
          attached: {
            conditions: attachedConditions,
            features: attachedFeatures,
          },
        }
        : node
      next.push(normalizeFeatureAttachments(sanitized))
      continue
    }

    if (node.type === 'repeat') {
      next.push({ ...node, items: normFeatureNodesForCatalog(node.items, featureIds) })
      continue
    }

    if (node.type === 'uptime') {
      next.push({
        ...node,
        items: normFeatureNodesForCatalog(node.items, featureIds),
        ...(node.setup ? { setup: normFeatureNodesForCatalog(node.setup, featureIds) } : {}),
      })
      continue
    }

    if (node.type === 'loop' && node.kind === 'start' && node.passForks) {
      next.push({
        ...node,
        passForks: Object.fromEntries(
          Object.entries(node.passForks).map(([run, body]) => [
            run,
            normFeatureNodesForCatalog(body, featureIds),
          ]),
        ),
      })
      continue
    }

    next.push(node)
  }

  return next
}

function normalizeScenarioMember(member: ScenarioTeamMember): ScenarioTeamMember[] {
  const seed = getResSeedBy(member.resonatorId)
  if (!seed) return []
  return [{
    ...member,
    id: teamMemberId(String(member.id || member.resonatorId)),
    resonatorId: seed.id,
    progression: {
      ...member.progression,
      skillLevels: cloneSkllLvl(member.progression.skillLevels),
      traceNodes: cloneTrcNode(member.progression.traceNodes),
    },
    loadout: {
      weapon: preserveWeaponForSeed(seed, member.loadout.weapon),
      echoes: repairEchoLoadoutForCatalog(member.loadout.echoes),
    },
    local: {
      controls: { ...member.local.controls },
      setConditionals: cloneSntSet(member.local.setConditionals),
      optimizerInventory: cloneOptInventorySelection(member.local.optimizerInventory),
    },
  } satisfies ScenarioTeamMember]
}

function normalizeScenario(
  scenario: CombatScenario,
  fallback: CombatScenario,
  revision: number,
): CombatScenario {
  const members = scenario.team?.members?.flatMap(normalizeScenarioMember) ?? []
  if (members.length === 0) return fallback

  const team = makeScenarioTeam(members.slice(0, 3))
  const ids = new Set(team.members.map((member) => member.id))
  const bySourceMemberId = Object.fromEntries(team.members.map((member) => {
    const routes = scenario.environment?.routing?.bySourceMemberId?.[member.id] ?? {}
    return [member.id, Object.fromEntries(
      Object.entries(routes).filter(([, target]) => target === null || ids.has(target)),
    )]
  })) as Record<TeamMemberId, Record<string, TeamMemberId | null>>

  return {
    ...scenario,
    id: combatScenarioId(String(scenario.id || 'workspace')),
    revision: Math.max(revision, Math.floor(scenario.revision ?? 0)),
    team,
    ...(scenario.dormantMembersByResonatorId ? {
      dormantMembersByResonatorId: Object.fromEntries(
        Object.entries(scenario.dormantMembersByResonatorId).flatMap(([resonatorId, saved]) => {
          if (saved.member.resonatorId !== resonatorId
            || members.some((member) => member.resonatorId === resonatorId)) return []
          const member = normalizeScenarioMember(saved.member)[0]
          return member ? [[resonatorId, {
            member,
            ...(saved.manualEffect ? { manualEffect: {
              ...saved.manualEffect,
              buffs: cloneBuffs(saved.manualEffect.buffs),
            } } : {}),
          }]] : []
        }),
      ),
    } : {}),
    contextMemberId: ids.has(scenario.contextMemberId)
      ? scenario.contextMemberId
      : team.members[0].id,
    target: normEnemyForCatalog(scenario.target ?? fallback.target),
    environment: {
      ...fallback.environment,
      ...(scenario.environment ?? {}),
      combatState: {
        ...fallback.environment.combatState,
        ...(scenario.environment?.combatState ?? {}),
      },
      teamEffects: {
        unisonBoon: scenario.environment?.teamEffects?.unisonBoon ?? 0,
      },
      manualEffects: scenario.environment?.manualEffects?.flatMap(
        (effect): EnvironmentManualEffect[] => {
          if (effect.selector.kind !== 'members') {
            return [{
              ...effect,
              selector: structuredClone(effect.selector),
              buffs: cloneBuffs(effect.buffs),
            }]
          }
          const memberIds = effect.selector.memberIds.filter((id) => ids.has(id))
          return memberIds.length > 0
            ? [{
              ...effect,
              selector: { ...effect.selector, memberIds },
              buffs: cloneBuffs(effect.buffs),
            }]
            : []
        },
      ) ?? fallback.environment.manualEffects,
      targetModifiers: {
        ...fallback.environment.targetModifiers,
        ...(scenario.environment?.targetModifiers ?? {}),
        resistanceReduction: {
          ...fallback.environment.targetModifiers.resistanceReduction,
          ...(scenario.environment?.targetModifiers?.resistanceReduction ?? {}),
        },
      },
      routing: { bySourceMemberId },
    },
    program: normRotationForCatalog(
      scenario.program ?? fallback.program,
      contextScenarioMember({ ...scenario, team }).resonatorId,
    ),
    initialOnFieldMemberId: ids.has(scenario.initialOnFieldMemberId)
      ? scenario.initialOnFieldMemberId
      : team.members[0].id,
  }
}

export function normalizeStoredCombatScenario(scenario: CombatScenario): CombatScenario {
  return normalizeScenario(scenario, scenario, scenario.revision ?? 0)
}

interface InitializedData {
  simulation: SimulationState
  library: SavedArtifactLibrary
  profiles: LegacyProfileMap
  runtimeRevision: number
}

// legacy calculator payloads mixed workspace state with saved artifacts.
function mkInitData(
  base?: PersistedUnknown['simulation'],
  saved?: PersistedUnknown['library'],
): InitializedData {
  const runtimeRevision = Math.max(0, Math.floor(base?.runtimeRevision ?? 0))
  const baseProfiles = normProfsCat(structuredClone(base?.profiles ?? {}))
  // equipped echoes reserve their uids before inventory duplicates are repaired,
  // preserving references from loadouts into the saved inventory.
  const invChs: SavedEcho[] = dedupeEchoUids(
    structuredClone(saved?.echoes ?? base?.inventoryEchoes ?? []).map((entry) => ({
      ...entry,
      echo: repairSavedEchoForCatalog(entry.echo),
    })),
    Object.values(baseProfiles).flatMap((profile) => profile.runtime.build.echoes),
  )
  const profiles = relinkEquippedEchoUids(baseProfiles, invChs)
  const invBlds: SavedBuild[] = normBldsCat(structuredClone(saved?.builds ?? base?.inventoryBuilds ?? []))
  const invRttn: SavedRotation[] = normRotsCat(structuredClone(saved?.rotations ?? base?.inventoryRotations ?? []))
  const invScenarios: SavedScenario[] = normScenariosCat(structuredClone(saved?.scenarios ?? []))
  const optimizerSettings = cloneOptSets(
    base?.optimizerSettings ?? base?.optimizerContext?.settings ?? null,
  )
  const optimizerSettingsResonatorId =
    base?.optimizerSettingsResonatorId
    ?? base?.optimizerContext?.resonatorId
    ?? null
  const weaponSuggests: WeaponPlanSet = structuredClone(base?.weaponSuggests ?? mkDefWpnSug())

  const suggsByResId = Object.fromEntries(
      Object.entries(base?.suggestionsByResonatorId ?? {}).map(([resonatorId, state]) => [
        resonatorId,
        structuredClone(state),
      ]),
  )

  return {
    runtimeRevision,
    profiles,
    simulation: {
      optimizerSettingsResonatorId,
      optimizerSettings,
      weaponSuggests,
      suggestionsByResonatorId: suggsByResId,
    },
    library: {
      echoes: invChs,
      builds: invBlds,
      rotations: invRttn,
      scenarios: invScenarios,
    },
  }
}

function normTmCat(teamMember: TeamMemRt): TeamMemRt {
  const seed = getResSeedBy(teamMember.id)

  return {
    ...teamMember,
    id: seed?.id ?? teamMember.id,
    build: {
      ...teamMember.build,
      weapon: preserveTeamWeaponForSeed(seed ?? null, teamMember.build.weapon),
      echoes: repairEchoLoadoutForCatalog(teamMember.build.echoes),
    },
  }
}

function xtrNsCtrls(
  controls: Record<string, boolean | number | string>,
  prefix: string,
): Record<string, boolean | number | string> {
  const scoped: Record<string, boolean | number | string> = {}

  for (const [key, value] of Object.entries(controls)) {
    if (key.startsWith(prefix)) {
      scoped[key.slice(prefix.length)] = value
    }
  }

  return scoped
}

function normTmNsCtrls(
  runtime: ResRuntime,
  controls: Record<string, boolean | number | string>,
): Record<string, boolean | number | string> {
  let nextControls = controls

  for (const teamMember of runtime.teamRuntimes) {
    if (!teamMember) {
      continue
    }

    const seed = getResSeedBy(teamMember.id)
    if (!seed) {
      continue
    }

    const prefix = `team:${teamMember.id}:`
    const teamControls = xtrNsCtrls(nextControls, prefix)
    const teamRuntime: ResRuntime = {
      id: teamMember.id,
      base: {
        level: MAX_RES_LVL,
        sequence: teamMember.base.sequence,
        skillLevels: mkMaxSkllLvl(),
        traceNodes: mkMaxTrcNode(seed),
      },
      build: {
        weapon: {
          ...catTmWpnAtk(teamMember.build.weapon, MAX_WPN_LVL),
          level: MAX_WPN_LVL,
        },
        echoes: teamMember.build.echoes,
        team: runtime.build.team,
      },
      state: {
        controls: teamControls,
        manualBuffs: cloneBuffs(teamMember.manualBuffs ?? makeCustomBuff()),
        combat: runtime.state.combat,
      },
      rotation: mkDefRot(seed),
      teamRuntimes: [null, null],
    }
    const normControls = normResRtCnt(teamRuntime)

    nextControls = { ...nextControls }
    for (const [key, value] of Object.entries(normControls)) {
      nextControls[`${prefix}${key}`] = value
    }
  }

  return nextControls
}

function normPrfLcl(
  resonatorId: string,
  profile: ResProf,
  localState: SlotLocalState,
  team: TeamSlots,
  teamRuntimes: [TeamMemRt | null, TeamMemRt | null],
): SlotLocalState {
  const seed = getResSeedBy(resonatorId) ?? getFallbackSeed()
  const runtime: ResRuntime = {
    id: resonatorId,
    base: profile.runtime.progression,
    build: {
      weapon: normWeaponForSeed(seed, profile.runtime.build.weapon),
      echoes: repairEchoLoadoutForCatalog(profile.runtime.build.echoes),
      team,
    },
    state: {
      controls: { ...localState.controls },
      manualBuffs: cloneBuffs(localState.manualBuffs),
      combat: { ...localState.combat },
    },
    rotation: profile.runtime.rotation,
    teamRuntimes,
  }
  const controls = normTmNsCtrls(runtime, normResRtCnt(runtime))
  const normRuntime = {
    ...runtime,
    state: {
      ...runtime.state,
      controls,
    },
  }

  return {
    ...localState,
    controls,
    combat: normNegFfctC(normRuntime),
    setConditionals: cloneSntSet(localState.setConditionals),
    optimizerInventory: cloneOptInventorySelection(localState.optimizerInventory),
  }
}

function normProfCat(
  resonatorId: string,
  profile: ResProf,
): ResProf {
  const seed = getResSeedBy(profile.resonatorId ?? resonatorId)
  const profileId = seed?.id ?? profile.resonatorId ?? resonatorId
  const teamRuntimes: [TeamMemRt | null, TeamMemRt | null] = [
    profile.runtime.teamRuntimes?.[0] ? normTmCat(profile.runtime.teamRuntimes[0]) : null,
    profile.runtime.teamRuntimes?.[1] ? normTmCat(profile.runtime.teamRuntimes[1]) : null,
  ]
  const team = [...profile.runtime.team] as TeamSlots

  return {
    ...profile,
    resonatorId: profileId,
    runtime: {
      ...profile.runtime,
      build: {
        ...profile.runtime.build,
        weapon: preserveWeaponForSeed(seed ?? null, profile.runtime.build.weapon),
        echoes: repairEchoLoadoutForCatalog(profile.runtime.build.echoes),
      },
      local: seed
        ? normPrfLcl(profileId, profile, profile.runtime.local, normProfTeam(profileId, profile.runtime.team), [
          teamRuntimes[0] && getResSeedBy(teamRuntimes[0].id) ? teamRuntimes[0] : null,
          teamRuntimes[1] && getResSeedBy(teamRuntimes[1].id) ? teamRuntimes[1] : null,
        ])
        : {
          ...profile.runtime.local,
          optimizerInventory: cloneOptInventorySelection(profile.runtime.local.optimizerInventory),
        },
      routing: cloneSlotRml(profile.runtime.routing),
      team,
      rotation: normRotationForCatalog(cloneRotation(profile.runtime.rotation), profileId),
      teamRuntimes,
    },
  }
}

function normProfsCat(profiles: LegacyProfileMap): LegacyProfileMap {
  return Object.fromEntries(
      Object.entries(profiles).map(([resonatorId, profile]) => {
        const normalized = normProfCat(resonatorId, profile)
        return [normalized.resonatorId || resonatorId, normalized]
      }),
  )
}

function catResName(
  resonatorId: string | null | undefined,
  fallback = '',
): string {
  if (!resonatorId) {
    return fallback
  }

  return getResSeedBy(resonatorId)?.name ?? (fallback || resonatorId)
}

function normBldsCat(builds: SavedBuild[]): SavedBuild[] {
  return builds.map((entry) => {
    const seed = getResSeedBy(entry.resonatorId)

    return {
      ...entry,
      resonatorName: catResName(entry.resonatorId, entry.resonatorName),
      build: {
        ...entry.build,
        weapon: preserveWeaponForSeed(seed ?? null, entry.build.weapon),
        echoes: repairEchoLoadoutForCatalog(entry.build.echoes),
      },
    }
  })
}

type LegacySavedRotation = {
  id: string
  name: string
  resonatorId?: string
  duration?: number
  note?: string
  items?: RotationNode[]
  scenario?: CombatScenario
  snapshot?: ResProf
  migration?: SavedRotation['migration']
  createdAt: number
  updatedAt: number
}

function savedRotationFallbackScenario(entry: LegacySavedRotation): CombatScenario {
  const scenarioContextId = entry.scenario?.team.members[0]?.resonatorId
  const requestedId = entry.resonatorId ?? scenarioContextId
  const seed = getResSeedBy(requestedId ?? '') ?? getFallbackSeed()
  const profile = entry.snapshot
    ? normProfCat(entry.snapshot.resonatorId, entry.snapshot)
    : makeResProfile(seed)
  return makeScenarioFromProfiles(
    { [profile.resonatorId]: profile },
    null,
    entry.scenario?.revision ?? 0,
    profile.resonatorId,
  )
}

/** normalizes all legacy saved-rotation shapes into scenario-backed artifacts. */
function normRotsCat(rotations: LegacySavedRotation[]): SavedRotation[] {
  return rotations.map((entry) => {
    const fallback = savedRotationFallbackScenario(entry)
    const scenario = entry.scenario
      ? normalizeScenario(entry.scenario, fallback, entry.scenario.revision)
      : {
        ...fallback,
        id: combatScenarioId(`saved-rotation:${entry.id}`),
        program: {
          ...fallback.program,
          program: cloneRotationNodes(entry.items ?? []),
        },
      }

    return {
      id: entry.id,
      name: entry.name,
      duration: normalizeDuration(entry.duration),
      note: normalizeRotNote(entry.note),
      scenario: structuredClone(scenario),
      ...(entry.migration ? { migration: { ...entry.migration } } : {}),
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    }
  })
}

function normScenariosCat(entries: SavedScenario[]): SavedScenario[] {
  return entries.map((entry) => {
    const context = entry.scenario.team.members.find(
      (member) => member.id === entry.scenario.contextMemberId,
    ) ?? entry.scenario.team.members[0]
    const seed = getResSeedBy(context.resonatorId) ?? getFallbackSeed()
    const fallback = makeScenarioFromProfiles(
      { [seed.id]: makeResProfile(seed) },
      null,
      entry.scenario.revision,
      seed.id,
    )
    return {
      ...entry,
      name: entry.name.trim() || `${seed.name} Scenario`,
      note: normalizeRotNote(entry.note),
      scenario: structuredClone(normalizeScenario(
        entry.scenario,
        fallback,
        entry.scenario.revision,
      )),
    }
  })
}

export function initAppState(
    state: PersistedUnknown,
): HydratedAppState {
  const initialized = mkInitData(state.simulation, state.library)
  const { simulation, library, profiles, runtimeRevision } = initialized
  const legacyScenario = makeScenarioFromProfiles(
    profiles,
    state.simulation.session,
    runtimeRevision,
  )
  const storedScenario = state.combat?.scenario
    ?? state.simulation.workspace?.currentScenario
  const scenario = storedScenario
    ? normalizeScenario(storedScenario, legacyScenario, runtimeRevision)
    : legacyScenario
  const storedScenarios = state.combat?.scenariosById
    ?? Object.fromEntries(Object.entries(state.combat?.documentsById ?? {}).map(
      ([id, document]) => [id, document.scenario],
    ))
  const normalizedScenarios = Object.fromEntries(Object.entries(storedScenarios).map(([id, candidate]) => {
    const scenarioId = combatScenarioId(id)
    const normalized = normalizeScenario(candidate, scenario, runtimeRevision)
    return [scenarioId, { ...normalized, id: scenarioId }]
  })) as ScenarioWorkspace['scenariosById']
  const selectedStoredId = state.combat?.selectedScenarioId
  const selectedStored = selectedStoredId ? normalizedScenarios[selectedStoredId] : null
  const selectedScenario = selectedStored ?? scenario
  const selectedId = selectedStored?.id ?? selectedScenario.id
  normalizedScenarios[selectedId] = selectedScenario

  const sourceOrder = [
    ...(state.combat?.order ?? []),
    ...Object.keys(normalizedScenarios).map(combatScenarioId),
  ].filter((id, index, values) => values.indexOf(id) === index && Boolean(normalizedScenarios[id]))
  const selectedContextId = contextScenarioMember(selectedScenario).resonatorId
  const contextIds = new Set<string>()
  const order = sourceOrder.filter((id) => {
    const candidate = normalizedScenarios[id]
    if (!candidate) return false
    const contextId = contextScenarioMember(candidate).resonatorId
    if (contextId === selectedContextId && id !== selectedId) return false
    if (contextIds.has(contextId)) return false
    contextIds.add(contextId)
    return true
  })
  if (!order.includes(selectedId)) order.unshift(selectedId)

  let combat: ScenarioWorkspace = {
    selectedScenarioId: selectedId,
    order,
    scenariosById: Object.fromEntries(order.map((id) => [id, normalizedScenarios[id]])),
  }

  for (const profile of Object.values(profiles)) {
    if (scenarioIdForContextResonator(combat, profile.resonatorId)) continue
    const id = combatScenarioId(`legacy:${profile.resonatorId}`)
    const migrated = {
      ...makeScenarioFromProfiles(
        profiles,
        { activeResonatorId: profile.resonatorId, enemyProfile: selectedScenario.target },
        runtimeRevision,
        profile.resonatorId,
      ),
      id,
    }
    combat = {
      ...combat,
      order: [...combat.order, id],
      scenariosById: { ...combat.scenariosById, [id]: migrated },
    }
  }

  return {
    version: APP_STATE_VER,
    combat,
    library,
    simulation: {
      ...simulation,
      // v28 snapshots predate the owner key. their one settings object belongs
      // to the scenario that was selected when the snapshot was written.
      optimizerSettingsResonatorId:
        simulation.optimizerSettingsResonatorId ?? selectedContextId,
    },
  }
}

/** fresh calculation state: one fallback scenario for the default resonator. */
export function makeAppState(
  options?: { maxedFallbackProfile?: boolean },
): HydratedAppState {
  const seed = getFallbackSeed()
  const scenario = makeScenarioFromProfiles(
    { [seed.id]: makeResProfile(seed, { maxed: options?.maxedFallbackProfile ?? true }) },
    null,
    0,
    seed.id,
  )

  return initAppState({
    version: APP_STATE_VER,
    combat: {
      selectedScenarioId: scenario.id,
      order: [scenario.id],
      scenariosById: { [scenario.id]: scenario },
    },
    simulation: {},
  })
}


