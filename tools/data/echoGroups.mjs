// The index includes new Sonata memberships for existing Echoes even when an
// incremental fetch skips their detail payloads. Keep those memberships current.
export function syncEchoGroups(echoes, indexEntries) {
  const groups = new Map(echoes.flatMap((echo) => Object.entries(echo.Group ?? {})))
  const indexById = new Map(indexEntries.map((entry) => [String(entry.id ?? entry.Id), entry]))

  return echoes.map((echo) => {
    const groupIds = indexById.get(String(echo.id ?? echo.Id))?.group
    if (!Array.isArray(groupIds)) return echo

    const group = Object.fromEntries(groupIds.map((id) => {
      const key = String(id)
      const definition = echo.Group?.[key] ?? groups.get(key)
      if (!definition) {
        throw new Error(`Missing Sonata group ${key} for Echo ${echo.id ?? echo.Id}; refresh Echo details before saving`)
      }
      return [key, definition]
    }))
    return { ...echo, Group: group }
  })
}
