/**
 * Edition-agnostic interface for attack-sequence engines.
 * Each edition (10e, later 11e) provides an implementation.
 */

export interface WeaponProfileInput {
  type: 'ranged' | 'melee'
  /** Attacks characteristic, dice notation allowed ("2", "D6", "D6+1") */
  attacks: string
  /** BS/WS (2-6); 0 means no hit roll (torrent) */
  skill: number
  strength: number
  /** AP as non-negative number (AP -1 = 1) */
  ap: number
  /** Damage characteristic, dice notation allowed */
  damage: string
  keywords: string[]
}

export interface WeaponInput {
  profile: WeaponProfileInput
  /** Number of weapons firing with this profile */
  count: number
}

/** A group of identical models within the defending unit */
export interface DefenderSegment {
  models: number
  toughness: number
  /** Armour save (2-6); 7+ = no save */
  save: number
  invuln?: number
  wounds: number
  feelNoPain?: number
}

export interface DefenderInput {
  /**
   * Model groups in allocation order: earlier segments take hits first.
   * Wound rolls use the majority Toughness across all segments (highest
   * on a tie); each segment rolls its own saves and Feel No Pain.
   */
  segments: DefenderSegment[]
  /** The final segment is an attached character (10e Leader rules):
   * reported separately and excluded from the models-slain distribution */
  attachedLast?: boolean
  /** Reduce each attack's damage by this amount (min 1) */
  damageReduction?: number
  /** Unit keywords, used by Anti-X weapons */
  keywords?: string[]
}

export type RerollMode = 'none' | 'ones' | 'fails'

/** Manual modifiers and battlefield situation toggles */
export interface AttackContext {
  /** To-hit modifier before the ±1 cap */
  hitMod?: number
  /** To-wound modifier before the ±1 cap */
  woundMod?: number
  rerollHits?: RerollMode
  rerollWounds?: RerollMode
  /** Unmodified hit roll needed for a critical hit (default 6) */
  critHitOn?: number
  /** Target is within half range (Rapid Fire, Melta) */
  halfRange?: boolean
  /** Attacker remained stationary (Heavy) */
  stationary?: boolean
  /** Attacker charged this turn (Lance) */
  charged?: boolean
  /** Defender has the Benefit of Cover */
  inCover?: boolean
}

export interface AttackResult {
  expected: {
    attacks: number
    hits: number
    wounds: number
    /** Wounds that got past saves (including Devastating Wounds) */
    unsaved: number
    /** Damage actually inflicted on the unit (overkill excluded) */
    damage: number
    modelsSlain: number
  }
  /** P(k bodyguard models slain) by index */
  slain: number[]
  /** P(total effective damage = d) by index */
  damage: number[]
  /** Probability the whole unit is destroyed (including any attached character) */
  unitKilled: number
  /** Probability the attached character is slain (only when one is attached) */
  attachedSlain?: number
}

export interface RulesEngine {
  edition: string
  resolveAttacks(
    weapons: WeaponInput[],
    defender: DefenderInput,
    context?: AttackContext,
  ): AttackResult
}
