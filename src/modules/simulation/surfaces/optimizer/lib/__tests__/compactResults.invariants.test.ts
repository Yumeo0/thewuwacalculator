/*
  Author: Runor Ewhro
  Description: Verifies the optimizer result facet table keeps exact numeric
               values, null stats, stable ties, and shared set plans.
*/

import { expect, it } from 'vitest'
import { ResultFacetTable, buildResultView, facetPlans, facetMainEchoes } from '../results'

it('retains exact numeric facet values, null stats, stable ties, and shared set plans', () => {
  const stats = { atk: 123.456789, hp: 1, def: 2, er: 3, cr: 4, cd: 5, bonus: 6, amp: 7 }
  const rows = [
    { damage: 10.123456789, mainId: '11', totalCost: 12, setBadges: [{ id: 1, count: 5 }], planKey: '1:5', stats },
    { damage: 10.123456789, mainId: '12', totalCost: 10, setBadges: [{ id: 1, count: 5 }], planKey: '1:5', stats: null },
  ]
  const table = new ResultFacetTable(rows.length)
  rows.forEach((row, index) => table.set(index, row))
  expect([...table]).toEqual(rows)
  expect(table.get(0).setBadges).toBe(table.get(1).setBadges)
  expect(buildResultView(table, { sortKey: 'damage', sortDir: 'desc', filter: [] })).toEqual([0, 1])
  expect(buildResultView(table, { sortKey: 'atk', sortDir: 'asc', filter: [{ kind: 'num', col: 'atk', op: 'gt', value: 120 }] })).toEqual([0])
  expect(facetPlans(table)).toEqual(facetPlans(rows))
  expect(facetMainEchoes(table)).toEqual(facetMainEchoes(rows))
})
