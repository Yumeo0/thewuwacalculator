/*
  Author: Runor Ewhro
  Description: Protects the generated contracts for the first Unison Resonators.
*/

import { describe, expect, it } from 'vitest'
import type { ResDtls } from '@/domain/entities/resonator'
import type { SrcPkg } from '@/domain/gameData/contracts'
import resonatorDetailsRaw from '../../../../public/data/beta/resonators/details.json?raw'
import resonatorSourcesRaw from '../../../../public/data/beta/resonators/sources.json?raw'

const details = JSON.parse(resonatorDetailsRaw) as Record<string, ResDtls>
const sources = JSON.parse(resonatorSourcesRaw) as SrcPkg[]

function sourceFor(resonatorId: string): SrcPkg {
  const source = sources.find((candidate) => candidate.source.id === resonatorId)
  if (!source) {
    throw new Error(`Missing generated source for Resonator ${resonatorId}`)
  }
  return source
}

function skillIdsByType(resonatorId: string): Record<string, string[]> {
  const grouped: Record<string, string[]> = {}

  for (const skill of sourceFor(resonatorId).skills ?? []) {
    const key = skill.skillType.join('+')
    grouped[key] ??= []
    grouped[key].push(skill.id)
  }

  return grouped
}

describe('Unison Resonator generated contracts', () => {
  it('authors Hsin from the Simplified Chinese duration and preserves her Electro Flare rows', () => {
    const hsin = sourceFor('1311')
    const inherent = details['1311']?.inherentSkills.find((entry) => entry.unlockLevel === 50)
    const skills = new Map(hsin.skills?.map((skill) => [skill.id, skill]))

    expect(inherent?.desc).toContain('30s')
    expect(inherent?.desc).not.toContain('7s')
    expect(details['1311']?.negativeEffectSources).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'electroFlare' }),
      expect.objectContaining({ type: 'maxAdd', key: 'electroFlare', value: 6 }),
    ]))
    expect(skills.get('1311:heart-of-thunder:five-stack')).toMatchObject({
      multiplier: 1.75,
      archetype: 'electroFlare',
      skillType: ['electroFlare'],
    })
    expect(skills.get('1311:heart-of-thunder:remaining')).toMatchObject({
      multiplier: 0.35,
      archetype: 'electroFlare',
      skillType: ['electroFlare'],
    })
    expect(skills.get('1311:s3:pillars-electro-flare')).toMatchObject({
      multiplier: 15,
      archetype: 'electroFlare',
      skillType: ['electroFlare'],
    })
  })

  it('keeps Hsin effect descriptions scoped to their applied effects', () => {
    const hsin = details['1311']
    const rawForte = hsin?.skillsByTab.forteCircuit?.desc ?? ''
    const expectedTides = hsin?.inherentSkills.find((entry) => entry.unlockLevel === 50)?.desc
    const rawSequence = hsin?.resonanceChains.find(
      (entry) => entry.name === 'A River of Lanterns, a River of Wishes',
    )?.desc
    const source = sourceFor('1311')
    const owners = new Map((source.owners ?? []).map((owner) => [owner.ownerKey, owner]))
    const effects = new Map((source.effects ?? []).map((effect) => [effect.id, effect]))
    const states = new Map(hsin?.stateGraph?.nodes.map((state) => [state.key, state]))
    const resonanceModes = hsin?.stateGraph?.groups?.find((group) => group.id === 'mode')?.modes

    expect(expectedTides).toContain('both Hsin and Rover: Electro gain 20% Electro DMG Bonus for 30s.')
    expect(expectedTides).not.toContain('both Hsin and Rover: Electro gain 20% Electro DMG Bonus for 7s.')
    expect(owners.get('team:1311:rover_electro_resonance')?.description).toContain('Thunderous Fury')
    expect(owners.get('team:1311:rover_electro_resonance')?.description).not.toContain('Manifold Unison')
    expect(states.get('inherent:1311:lvl50:unison_active')?.description).toContain('ATK by 50% for 8s')
    expect(states.get('inherent:1311:lvl50:electro_flare_stacks')?.description).toContain('25% Electro DMG Bonus')
    expect(states.get('team:1311:rover_electro_resonance:active')?.description).toContain('30s')
    expect(states.get('sequence:1311:s4:active')?.description).toBe(rawSequence)

    expect(effects.get('1311:s1:heart-of-thunder')?.operations).toEqual([{
      type: 'scale_skill_multiplier',
      match: { skillIds: ['1311:heart-of-thunder:remaining'] },
      value: { type: 'const', value: 1.2 },
    }])
    for (const ownerKey of ['resonator:1311:unison_boon']) {
      expect(rawForte).toContain(owners.get(ownerKey)?.description)
    }
    expect(resonanceModes?.find((mode) => mode.id === 'unison')?.body).toContain('Formshift')
    expect(resonanceModes?.find((mode) => mode.id === 'electro_flare')?.body).toContain('targets within a certain range do not lose')
  })

  it('classifies every Hsin damage row by the damage types stated in her descriptions', () => {
    expect(skillIdsByType('1311')).toEqual({
      basicAtk: [
        '1311101',
        '1311102',
        '1311103',
        '1311104',
        '1311106',
        '1311108',
        '1311109',
        '1311110',
        '1311111',
        '1311112',
        '1311113',
        '1311115',
        '1311116',
        '1311117',
        '1311118',
        '1311119',
        '1311120',
        '1311121',
        '1311122',
      ],
      heavyAtk: ['1311105', '1311107', '1311114'],
      resonanceSkill: [
        '1311201',
        '1311202',
        '1311203',
        '1311701',
        '1311702',
        '1311703',
        '1311704',
        '1311302',
        '1311603',
        '1311606',
      ],
      electroFlare: [
        '1311:heart-of-thunder:five-stack',
        '1311:heart-of-thunder:remaining',
        '1311:s3:pillars-electro-flare',
        '1311:negative-effect:electro-flare',
      ],
      coord: ['1311303'],
      introSkill: ['1311601', '1311602', '1311604', '1311605'],
      outroSkill: ['1311:outro'],
      tuneRupture: ['1311:tune-break'],
      spectroFrazzle: ['1311:negative-effect:spectro-frazzle'],
      aeroErosion: ['1311:negative-effect:aero-erosion'],
      fusionBurst: ['1311:negative-effect:fusion-burst'],
      glacioChafe: ['1311:negative-effect:glacio-chafe'],
    })
  })

  it('authors Hsin\'s Source Intent Unison loop without overcounting the Answering setup', () => {
    const rotation = sourceFor('1311').rotations?.find((candidate) => candidate.id === 'default')

    expect(rotation?.items.flatMap((item) => (
      item.type === 'feature' ? [[item.featureId, item.multiplier]] : []
    ))).toEqual([
      ['damage:1311603', 1],
      ['damage:1311201', 1],
      ['damage:1311104', 1],
      ['damage:1311702', 1],
      ['damage:1311:outro', 1],
      ['damage:1311303', 21],
      ['damage:1311606', 1],
      ['damage:1311118', 1],
      ['damage:1311119', 1],
      ['damage:1311120', 1],
      ['damage:1311121', 1],
      ['damage:1311704', 1],
      ['damage:1311302', 1],
      ['damage:1311:outro', 1],
    ])
    expect(rotation?.items).not.toContainEqual(expect.objectContaining({
      featureId: 'damage:1311103',
    }))
  })

  it('authors Suoming\'s two-entry Unison loop and all six Thunder Crests', () => {
    const suoming = sourceFor('1312')
    const rotation = suoming.rotations?.find((candidate) => candidate.id === 'default')
    const skills = new Map(suoming.skills?.map((skill) => [skill.id, skill]))

    expect(rotation?.items.flatMap((item) => (
      item.type === 'feature' ? [[item.featureId, item.multiplier]] : []
    ))).toEqual([
      ['damage:1312026', 1],
      ['damage:1312021', 1],
      ['damage:1312025', 6],
      ['damage:1312027', 1],
      ['damage:1312012', 1],
      ['damage:1312006', 1],
      ['damage:1312007', 1],
      ['damage:1312017', 1],
      ['damage:1312018', 1],
    ])
    expect(rotation?.items).not.toContainEqual(expect.objectContaining({
      featureId: 'damage:1312011',
    }))
    expect(['1312026', '1312027', '1312028', '1312029'].map((id) => skills.get(id)?.skillType)).toEqual([
      ['basicAtk'],
      ['basicAtk'],
      ['basicAtk'],
      ['basicAtk'],
    ])
    expect(skills.get('1312025')?.skillType).toEqual(['coord'])
  })

  it('keeps Suoming descriptions scoped to their controls and effects', () => {
    const suoming = details['1312']
    const rawForte = suoming?.skillsByTab.forteCircuit?.desc ?? ''
    const rawOutro = suoming?.outroSkills.find((entry) => entry.name === 'Canopy Rumble')?.desc
    const source = sourceFor('1312')
    const owners = new Map((source.owners ?? []).map((owner) => [owner.ownerKey, owner]))
    const effects = new Map((source.effects ?? []).map((effect) => [effect.id, effect]))
    const states = new Map(suoming?.stateGraph?.nodes.map((state) => [state.key, state]))

    expect(owners.get('team:1312:canopy_rumble')?.description).toBe(rawOutro)
    expect(rawForte).toContain(owners.get('resonator:1312:unison_boon')?.description)
    expect(owners.get('team:1312:incoming_unison_boon')?.description).toContain('Set this to the number of')
    expect(states.get('inherent:1312:lvl50:active')?.description).toContain('50% Electro DMG Bonus for 15s')
    expect(states.get('inherent:1312:aligned_seals:active')?.description).toContain('30% Electro DMG Bonus')
    expect(states.get('inherent:1312:aligned_seals:active')?.description).not.toContain('Seal Master')
    expect(states.get('resonator:1312:seal_master:active')?.description).toContain('each stage restores 5 Concerto Energy on hit')
    expect(states.get('sequence:1312:s3:active')?.description).toContain('Resonance Liberation')
    expect(effects.get('1312:lvl70:seal-master-multiplier')).toMatchObject({ operations: [{
      type: 'add_skill_multiplier',
      value: { type: 'const', value: 1 },
    }] })
    expect(effects.get('1312:lvl70:seal-master-crit-dmg')).toMatchObject({ operations: [{
      type: 'add_top_stat',
      stat: 'critDmg',
      value: { type: 'const', value: 100 },
    }] })
  })

  it('classifies every Suoming damage row by the damage types stated in her descriptions', () => {
    expect(skillIdsByType('1312')).toEqual({
      basicAtk: [
        '1312001',
        '1312002',
        '1312003',
        '1312004',
        '1312005',
        '1312006',
        '1312007',
        '1312008',
        '1312009',
        '1312010',
        '1312011',
        '1312012',
        '1312016',
        '1312017',
        '1312018',
        '1312019',
        '1312026',
        '1312027',
        '1312028',
        '1312029',
      ],
      resonanceSkill: ['1312013', '1312014'],
      resonanceLiberation: ['1312021'],
      coord: ['1312025'],
      tuneRupture: ['1312:tune-break'],
      spectroFrazzle: ['1312:negative-effect:spectro-frazzle'],
      aeroErosion: ['1312:negative-effect:aero-erosion'],
      fusionBurst: ['1312:negative-effect:fusion-burst'],
      glacioChafe: ['1312:negative-effect:glacio-chafe'],
      electroFlare: ['1312:negative-effect:electro-flare'],
    })
  })

  it('keeps Hsin Unison stacks and Suoming handoff effects sequence-aware', () => {
    const hsinBoon = details['1311']?.stateGraph?.nodes.find(
      (node) => node.key === 'resonator:1311:unison_boon:stacks',
    )
    const suomingBoon = details['1312']?.stateGraph?.nodes.find(
      (node) => node.key === 'resonator:1312:unison_boon:stacks',
    )
    const suoming = sourceFor('1312')

    expect(hsinBoon).toMatchObject({
      kind: 'number',
      max: 2,
      maxWhen: [
        { max: 4 },
        { max: 3 },
      ],
    })
    expect(suomingBoon).toMatchObject({
      kind: 'number',
      max: 2,
      maxWhen: [{ max: 4 }, { max: 3 }],
    })
    expect(details['1312']?.stateGraph?.groups).toContainEqual(expect.objectContaining({
      id: 'aligned-seals-or-seal-master',
      maxKey: 'resonator:1312:seal_master:active',
    }))
    expect(suoming.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: '1312:lvl70:aligned-seals', targetScope: 'activeOther' }),
      expect.objectContaining({ id: '1312:outro:electro', targetScope: 'activeOther' }),
      expect.objectContaining({ id: '1312:outro:resonance-skill', targetScope: 'activeOther' }),
      expect.objectContaining({ id: '1312:s2:outro-crit-dmg', targetScope: 'activeOther' }),
    ]))
  })
})
