import { useEffect, useState } from 'react'
import { loadFaction, loadIndex } from './loader.ts'
import type { DataIndex, FactionFile } from './types.ts'

interface Loadable<T> {
  data?: T
  error?: string
}

export function useDataIndex(edition: string): Loadable<DataIndex> {
  const [state, setState] = useState<Loadable<DataIndex>>({})
  useEffect(() => {
    let live = true
    loadIndex(edition)
      .then((data) => live && setState({ data }))
      .catch((e: Error) => live && setState({ error: e.message }))
    return () => {
      live = false
    }
  }, [edition])
  return state
}

export function useFaction(
  edition: string,
  file: string | undefined,
): Loadable<FactionFile> {
  const [state, setState] = useState<Loadable<FactionFile> & { key?: string }>(
    {},
  )
  const key = `${edition}/${file}`
  useEffect(() => {
    if (!file) return
    let live = true
    loadFaction(edition, file)
      .then((data) => live && setState({ key, data }))
      .catch((e: Error) => live && setState({ key, error: e.message }))
    return () => {
      live = false
    }
  }, [edition, file, key])
  // a result for a previously selected faction is stale, not current
  return state.key === key ? state : {}
}
