import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const publicDir = fileURLToPath(new URL('../../public/', import.meta.url))

export async function buildWeaponCoreCatalog(mode) {
  const root = join(publicDir, 'data', mode, 'weapons')
  const weapons = JSON.parse(await readFile(join(root, 'catalog.json'), 'utf8'))
  const levels = Object.keys(weapons[0]?.statsByLevel ?? {}).map(Number)
  const compact = weapons.map(({ statsByLevel, passive, ...metadata }) => ({
    ...metadata,
    passiveName: passive.name,
    values: levels.flatMap((level) => {
      const row = statsByLevel[level]
      if (!row) throw new Error(`Missing weapon level ${level} for ${metadata.id}`)
      return [row.atk, row.secondaryStatValue]
    }),
  }))
  await writeFile(join(root, 'core-catalog.json'), JSON.stringify({ levels, weapons: compact }))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await Promise.all(['beta', 'live'].map(buildWeaponCoreCatalog))
}
