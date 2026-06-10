// Output schema for the generated faction data files.
// Consumed by the app from public/data/<edition>/.

export interface DataIndex {
  schema: 1
  edition: string
  /** BSData repo the data was generated from */
  source: string
  /** Commit SHA of the BSData repo */
  sha: string
  generatedAt: string
  factions: FactionRef[]
}

export interface FactionRef {
  id: string
  slug: string
  name: string
  file: string
  unitCount: number
}

export interface FactionFile {
  schema: 1
  edition: string
  sha: string
  id: string
  name: string
  units: Unit[]
}

export interface Unit {
  id: string
  name: string
  /** True for units only legal in the Legends ruleset */
  legends?: boolean
  /** Category keywords (Infantry, Vehicle, Faction: ..., etc.) */
  keywords: string[]
  abilities: Ability[]
  /** Invulnerable save (e.g. 4 for 4+), parsed from ability text */
  invuln?: number
  /** Feel No Pain (e.g. 5 for 5+), parsed from ability text */
  feelNoPain?: number
  /** Base points cost, plus thresholds for larger unit sizes */
  points: PointsTier[]
  /** Defensive stat lines available in this unit */
  statlines: Statline[]
  models: Model[]
  /** Weapon definitions referenced by models, keyed by id */
  weapons: Record<string, Weapon>
  /**
   * Weapons attached at unit level rather than to a specific model
   * (uncommon; resolved properly in the loadout UI)
   */
  looseWeapons: WeaponRef[]
}

export interface Ability {
  name: string
  text: string
}

export interface PointsTier {
  /** Minimum number of models for this tier; absent = base cost */
  atLeast?: number
  pts: number
}

export interface Statline {
  id: string
  name: string
  M: string
  T: number
  SV: number
  W: number
  LD: string
  OC: number
}

export interface Model {
  id: string
  name: string
  /** id into Unit.statlines */
  statlineId: string
  min: number
  max: number
  weapons: WeaponRef[]
}

export interface WeaponRef {
  /** id into Unit.weapons */
  weaponId: string
  /** Number carried by default (0 = optional, not equipped) */
  defaultCount: number
  max: number
  /** Group of mutually exclusive options this belongs to, if any */
  choiceGroup?: string
}

export interface Weapon {
  id: string
  name: string
  profiles: WeaponProfile[]
}

export interface WeaponProfile {
  name: string
  type: 'ranged' | 'melee'
  /** Range in inches; 0 for melee */
  range: number
  /** Attacks characteristic, e.g. "2", "D6", "D6+1" */
  attacks: string
  /** BS/WS; 0 means N/A (torrent weapons) */
  skill: number
  strength: number
  /** AP as a non-negative number (AP -1 stored as 1) */
  ap: number
  /** Damage characteristic, e.g. "1", "D3", "D6+2" */
  damage: string
  keywords: string[]
}
