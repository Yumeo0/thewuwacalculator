/*
  Author: Runor Ewhro
  Description: Exposes the latest release summary without importing the complete
               changelog dataset into persistent application code.
*/

export const CURRENT_CHANGE_NOTICE = {
  date: '11/09/2026',
  patchVersion: '3.7.1 beta',
  shortDesc: '3.7.1 beta update',
} as const

export const CURRENT_CHANGE_NOTICE_KEY =
  `${CURRENT_CHANGE_NOTICE.date}:${CURRENT_CHANGE_NOTICE.shortDesc}`
