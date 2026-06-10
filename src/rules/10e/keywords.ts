import { parseDice, isParseableDice } from './dice.ts'
import type { Dist } from './dist.ts'

export interface ParsedKeywords {
  torrent: boolean
  lethalHits: boolean
  devastatingWounds: boolean
  twinLinked: boolean
  blast: boolean
  heavy: boolean
  lance: boolean
  ignoresCover: boolean
  hazardous: boolean
  /** Extra hits per critical hit */
  sustainedHits?: Dist
  /** Extra attacks within half range */
  rapidFire?: Dist
  /** Extra damage within half range */
  melta?: Dist
  /** Critical wound thresholds against matching target keywords */
  anti: { keyword: string; threshold: number }[]
  /** Keywords that don't affect the math (Pistol, Assault, Precision...) */
  other: string[]
}

const VALUE_RE = {
  sustained: /^sustained hits\s+(.+)$/i,
  rapidFire: /^rapid fire\s+(.+)$/i,
  melta: /^melta\s+(.+)$/i,
  anti: /^anti-(.+?)\s+(\d)\+$/i,
}

export function parseKeywords(keywords: string[]): ParsedKeywords {
  const parsed: ParsedKeywords = {
    torrent: false,
    lethalHits: false,
    devastatingWounds: false,
    twinLinked: false,
    blast: false,
    heavy: false,
    lance: false,
    ignoresCover: false,
    hazardous: false,
    anti: [],
    other: [],
  }
  for (const raw of keywords) {
    const kw = raw.trim()
    const lower = kw.toLowerCase()
    if (lower === 'torrent') parsed.torrent = true
    else if (lower === 'lethal hits') parsed.lethalHits = true
    else if (lower === 'devastating wounds') parsed.devastatingWounds = true
    else if (lower === 'twin-linked' || lower === 'twin linked')
      parsed.twinLinked = true
    else if (lower === 'blast') parsed.blast = true
    else if (lower === 'heavy') parsed.heavy = true
    else if (lower === 'lance') parsed.lance = true
    else if (lower === 'ignores cover') parsed.ignoresCover = true
    else if (lower === 'hazardous') parsed.hazardous = true
    else if (VALUE_RE.sustained.test(kw)) {
      const value = VALUE_RE.sustained.exec(kw)![1]
      if (isParseableDice(value)) parsed.sustainedHits = parseDice(value)
      else parsed.other.push(kw)
    } else if (VALUE_RE.rapidFire.test(kw)) {
      const value = VALUE_RE.rapidFire.exec(kw)![1]
      if (isParseableDice(value)) parsed.rapidFire = parseDice(value)
      else parsed.other.push(kw)
    } else if (VALUE_RE.melta.test(kw)) {
      const value = VALUE_RE.melta.exec(kw)![1]
      if (isParseableDice(value)) parsed.melta = parseDice(value)
      else parsed.other.push(kw)
    } else if (VALUE_RE.anti.test(kw)) {
      const m = VALUE_RE.anti.exec(kw)!
      parsed.anti.push({
        keyword: m[1].trim().toLowerCase(),
        threshold: Number(m[2]),
      })
    } else {
      parsed.other.push(kw)
    }
  }
  return parsed
}
