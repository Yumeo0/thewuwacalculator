/*
  Author: Runor Ewhro
  Description: protects authored enemy mechanics that are not represented by
               resistance rows in the generated enemy catalog.
*/

import { describe, expect, it } from 'vitest'
import type { EffectScope, SrcPkg } from '@/domain/gameData/contracts'
import { mkGameDataRe, listSrcRtFfc } from '@/data/gameData/registry'
import { evalCond, evalForm } from '@/engine/effects/evaluator'
import enemySourcesRaw from '../../../../public/data/beta/enemies/sources.json?raw'
import liveSourcesRaw from '../../../../public/data/live/enemies/sources.json?raw'

const betaSources = JSON.parse(enemySourcesRaw) as SrcPkg[]
const liveSources = JSON.parse(liveSourcesRaw) as SrcPkg[]

function scope(paradox: number): EffectScope {
  return {
    context: {
      enemy: {
        status: { paradox },
        res: { 0: 10, 1: 20, 2: 30, 3: 40, 4: 50, 5: 60, 6: 70 },
      },
    },
  } as unknown as EffectScope
}

const NEGATIVE_STATUS_TYPES = [
  'spectroFrazzle',
  'aeroErosion',
  'fusionBurst',
  'havocBane',
  'glacioChafe',
  'electroFlare',
]

function getEnemySource(sources: SrcPkg[], enemyId: string): SrcPkg {
  const source = sources.find((candidate) => candidate.source.type === 'enemy' && candidate.source.id === enemyId)
  expect(source, `enemy ${enemyId} is missing its generated source package`).toBeDefined()
  return source as SrcPkg
}

describe('enemy source invariants', () => {
  it('keeps beta and live enemy mechanics identical', () => {
    expect(liveSources).toEqual(betaSources)
  })

  it('encodes the new 3.6 enemy vulnerabilities', () => {
    const sources = JSON.parse(enemySourcesRaw) as SrcPkg[]
    const skywatchLancer = getEnemySource(sources, '320000690')
    const skywatchOperation = skywatchLancer.effects?.[0]?.operations[0]

    expect(skywatchOperation).toMatchObject({
      type: 'add_skilltype_mod',
      skillType: NEGATIVE_STATUS_TYPES,
      mod: 'dmgVuln',
      value: { type: 'const', value: 100 },
    })

    const calamityEffigy = getEnemySource(sources, '340000320')
    expect(calamityEffigy.states).toContainEqual(expect.objectContaining({
      id: 'affectedByNegStatus',
      path: 'enemy.status.affectedByNegStatus',
      kind: 'toggle',
      defaultValue: false,
    }))
    expect(calamityEffigy.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'enemy:340000320:electro-flare-vuln',
        operations: [expect.objectContaining({
          type: 'add_skilltype_mod',
          skillType: ['electroFlare'],
          mod: 'dmgVuln',
          value: { type: 'const', value: 100 },
        })],
      }),
      expect.objectContaining({
        id: 'enemy:340000320:status-triggered-vuln',
        condition: {
          type: 'truthy',
          from: 'context',
          path: 'enemy.status.affectedByNegStatus',
        },
        operations: [{
          type: 'add_top_stat',
          stat: 'dmgVuln',
          value: { type: 'const', value: 20 },
        }],
      }),
    ]))
  })

  it('includes Sigillum additional vulnerability at five Off Course stacks', () => {
    const sources = JSON.parse(enemySourcesRaw) as SrcPkg[]

    for (const enemyId of ['340000250', '340000251']) {
      const source = getEnemySource(sources, enemyId)
      expect(source.effects).toContainEqual(expect.objectContaining({
        id: `enemy:${enemyId}:off-course-max-vuln`,
        condition: {
          type: 'gte',
          from: 'context',
          path: 'enemy.status.offCourse',
          value: 5,
        },
        operations: [{
          type: 'add_top_stat',
          stat: 'dmgVuln',
          value: { type: 'const', value: 30 },
        }],
      }))
    }
  })

  it('reuses quantified mechanics for the new 3.7 encounter variants', () => {
    for (const [newId, originalId] of [
      ['340000212', '340000210'],
      ['340000213', '340000210'],
      ['340000221', '340000220'],
      ['340000222', '340000220'],
      ['340000252', '340000250'],
      ['340000261', '340000260'],
    ]) {
      const current = getEnemySource(betaSources, newId)
      const original = getEnemySource(betaSources, originalId)
      expect(current.effects?.map((effect) => effect.id.replace(newId, '')))
        .toEqual(original.effects?.map((effect) => effect.id.replace(originalId, '')))
      expect(current.states?.map((state) => state.id))
        .toEqual(original.states?.map((state) => state.id))
    }
  })

  it('applies Suhsin Paradox vulnerability and removes each current resistance at two stacks', () => {
    const registry = mkGameDataRe(betaSources)

    for (const id of ['340000330', '340000331', '340000332']) {
      const source = getEnemySource(betaSources, id)
      const paradox = source.states?.find((state) => state.id === 'paradox')
      const vulnerability = source.effects?.find((effect) => effect.id.endsWith(':paradox-vuln'))
      const resistance = source.effects?.find((effect) => effect.id.endsWith(':paradox-res-zero'))

      expect(paradox).toMatchObject({ kind: 'stack', max: 2, path: 'enemy.status.paradox' })
      expect(vulnerability?.operations).toMatchObject([{ type: 'add_top_stat', stat: 'dmgVuln' }])
      expect(resistance?.operations).toHaveLength(7)
      expect(listSrcRtFfc(registry, { type: 'enemy', id }, 'preStats').map((effect) => effect.id))
        .toEqual([`enemy:${id}:paradox-vuln`, `enemy:${id}:paradox-res-zero`])
      if (!vulnerability || !resistance) throw new Error(`Missing Suhsin effects for ${id}`)

      const value = vulnerability.operations[0]
      if (!value || !('value' in value)) throw new Error(`Missing Paradox value for ${id}`)
      expect(evalForm(value.value, scope(1))).toBe(15)
      expect(evalForm(value.value, scope(2))).toBe(30)
      expect(evalCond(resistance.condition, scope(1))).toBe(false)
      expect(evalCond(resistance.condition, scope(2))).toBe(true)

      for (const [index, operation] of resistance.operations.entries()) {
        expect(operation).toMatchObject({ type: 'add_attribute_mod', mod: 'resShred' })
        if (!('value' in operation)) throw new Error(`Missing RES value for ${id}`)
        expect(evalForm(operation.value, scope(2))).toBe((index + 1) * 10)
      }
    }
  })
})
