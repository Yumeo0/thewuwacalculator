/*
  Author: Runor Ewhro
  Description: Defines game-data identities required before catalog bundles are
               available.
*/

export const DEF_RES_ID = '1506'

/** Schema version stamped into source-manifest.json. Hosts may serve data
 * independently of the library, so a mismatch must fail loudly instead of
 * producing silently wrong calculations. Bump on breaking data shape changes. */
export const GAME_DATA_SCHEMA_VERSION = 1
