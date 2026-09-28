/*
  Author: Runor Ewhro
  Description: Protects the quantified 3.7 enemy mechanics shared by live and beta.
*/

import { describe, expect, it } from 'vitest'
import type { EffectScope, SrcPkg } from '@/domain/gameData/contracts'
import { listSrcRtFfc, mkGameDataRe } from '@/domain/gameData/registry'
import { evalCond, evalForm } from '@/engine/effects/evaluator'
import betaRaw from '../../../../public/data/beta/enemies/sources.json?raw'
import liveRaw from '../../../../public/data/live/enemies/sources.json?raw'

const beta = JSON.parse(betaRaw) as SrcPkg[]
const live = JSON.parse(liveRaw) as SrcPkg[]
const byId = new Map(beta.map((entry) => [entry.source.id, entry]))
const registry = mkGameDataRe(beta)

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

describe('3.7 enemy sources', () => {
  it('keeps live and beta enemy mechanics identical', () => {
    expect(live).toEqual(beta)
  })

  it('reuses quantified mechanics for the new encounter variants', () => {
    for (const [newId, originalId] of [
      ['340000212', '340000210'],
      ['340000213', '340000210'],
      ['340000221', '340000220'],
      ['340000222', '340000220'],
      ['340000252', '340000250'],
      ['340000261', '340000260'],
    ]) {
      const current = byId.get(newId)
      const original = byId.get(originalId)
      expect(current, `Missing ${newId}`).toBeDefined()
      expect(original, `Missing ${originalId}`).toBeDefined()
      expect(current?.effects?.map((effect) => effect.id.replace(newId, '')))
        .toEqual(original?.effects?.map((effect) => effect.id.replace(originalId, '')))
      expect(current?.states?.map((state) => state.id))
        .toEqual(original?.states?.map((state) => state.id))
    }
  })

  it('applies Suhsin Paradox vulnerability and removes each current resistance at two stacks', () => {
    for (const id of ['340000330', '340000331', '340000332']) {
      const source = byId.get(id)
      const paradox = source?.states?.find((state) => state.id === 'paradox')
      const vulnerability = source?.effects?.find((effect) => effect.id.endsWith(':paradox-vuln'))
      const resistance = source?.effects?.find((effect) => effect.id.endsWith(':paradox-res-zero'))

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
