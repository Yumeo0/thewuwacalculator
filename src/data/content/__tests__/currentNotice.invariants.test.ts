/*
  Author: Runor Ewhro
  Description: Keeps the compact release notice derived from the latest authored
               changelog entry and its persistence key.
*/

import { expect, it } from 'vitest'
import { CURRENT_CHANGE_NOTICE, CURRENT_CHANGE_NOTICE_KEY } from '../currentChangelogNotice'
import { getCurChngTs, ltstCurChngE } from '../changelogEntries'

it('keeps the shell notice aligned with the latest authored changelog entry', () => {
  expect(ltstCurChngE?.date).toBe(CURRENT_CHANGE_NOTICE.date)
  expect(ltstCurChngE?.shortDesc).toBe(CURRENT_CHANGE_NOTICE.shortDesc)
  expect(getCurChngTs(ltstCurChngE)).toBe(CURRENT_CHANGE_NOTICE_KEY)
})
