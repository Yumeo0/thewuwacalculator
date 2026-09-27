import { describe, expect, it } from 'vitest'
import { syncEchoGroups } from '../echoGroups.mjs'

describe('incremental Echo Sonata memberships', () => {
  const oldSet = { Id: 34, Name: 'Old set' }
  const newSet = { Id: 37, Name: 'New set' }
  const echoes = [
    { id: 'existing', Group: { 34: oldSet }, Skill: { Desc: 'Retained skill' } },
    { id: 'new', Group: { 37: newSet } },
  ]

  it('updates skipped Echoes from the full index while preserving their details', () => {
    const result = syncEchoGroups(echoes, [{ id: 'existing', group: [34, 37] }])
    expect(result[0].Group).toEqual({ 34: oldSet, 37: newSet })
    expect(result[0].Skill).toBe(echoes[0].Skill)
    expect(result[1]).toBe(echoes[1])
    expect(echoes[0].Group).toEqual({ 34: oldSet })
  })

  it('also removes memberships removed from the source index', () => {
    expect(syncEchoGroups(echoes, [{ id: 'existing', group: [37] }])[0].Group)
      .toEqual({ 37: newSet })
  })

  it('rejects unknown groups instead of writing incomplete metadata', () => {
    expect(() => syncEchoGroups(echoes, [{ id: 'existing', group: [99] }]))
      .toThrow('Missing Sonata group 99')
  })
})
