import { XMLParser } from 'fast-xml-parser'

// BattleScribe element names that can repeat and must always parse as arrays
const ARRAY_TAGS = new Set([
  'catalogueLink',
  'categoryEntry',
  'categoryLink',
  'characteristic',
  'characteristicType',
  'condition',
  'conditionGroup',
  'constraint',
  'cost',
  'costType',
  'entryLink',
  'infoLink',
  'modifier',
  'modifierGroup',
  'profile',
  'profileType',
  'publication',
  'rule',
  'selectionEntry',
  'selectionEntryGroup',
])

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: '#text',
  // keep "3+", "24\"" and ids as strings
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => ARRAY_TAGS.has(name),
})

export type BSNode = Record<string, unknown>

export interface BSDocument {
  kind: 'catalogue' | 'gameSystem'
  root: BSNode
  fileName: string
}

export function parseBsXml(xml: string, fileName: string): BSDocument {
  const doc = parser.parse(xml) as Record<string, BSNode>
  if (doc.catalogue) {
    return { kind: 'catalogue', root: doc.catalogue, fileName }
  }
  if (doc.gameSystem) {
    return { kind: 'gameSystem', root: doc.gameSystem, fileName }
  }
  throw new Error(`${fileName}: not a BattleScribe catalogue or game system`)
}
