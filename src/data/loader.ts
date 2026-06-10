import type { DataIndex, FactionFile } from './types.ts'

const dataUrl = (edition: string, file: string) =>
  `${import.meta.env.BASE_URL}data/${edition}/${file}`

const indexCache = new Map<string, Promise<DataIndex>>()
const factionCache = new Map<string, Promise<FactionFile>>()

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`)
  return res.json() as Promise<T>
}

export function loadIndex(edition: string): Promise<DataIndex> {
  let p = indexCache.get(edition)
  if (!p) {
    p = fetchJson<DataIndex>(dataUrl(edition, 'index.json'))
    indexCache.set(edition, p)
  }
  return p
}

export function loadFaction(
  edition: string,
  file: string,
): Promise<FactionFile> {
  const key = `${edition}/${file}`
  let p = factionCache.get(key)
  if (!p) {
    p = fetchJson<FactionFile>(dataUrl(edition, file))
    factionCache.set(key, p)
  }
  return p
}
