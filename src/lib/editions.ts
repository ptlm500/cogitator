import type { AttackContext } from '@/rules/types.ts'

export interface SituationToggle {
  key: keyof Pick<
    AttackContext,
    | 'halfRange'
    | 'stationary'
    | 'charged'
    | 'inCover'
    | 'engaged'
    | 'indirectFire'
  >
  label: string
  hint: string
}

/** Edition-specific UI behaviour */
export interface EditionUi {
  /** How many characters can attach to a unit (11e: Leader + Support) */
  maxAttachedCharacters: number
  /** 11e: the defender chooses the defense-group allocation order */
  groupReorder: boolean
  situations: SituationToggle[]
}

const COMMON: SituationToggle[] = [
  { key: 'halfRange', label: 'Half range', hint: 'Rapid Fire / Melta' },
  { key: 'charged', label: 'Charged', hint: 'Lance' },
]

export const editionUi: Record<string, EditionUi> = {
  '10e': {
    maxAttachedCharacters: 1,
    groupReorder: false,
    situations: [
      ...COMMON,
      { key: 'stationary', label: 'Stationary', hint: 'Heavy' },
      {
        key: 'inCover',
        label: 'Target in cover',
        hint: 'Benefit of Cover: +1 to armour saves',
      },
    ],
  },
  '11e': {
    maxAttachedCharacters: 2,
    groupReorder: true,
    situations: [
      ...COMMON,
      {
        key: 'stationary',
        label: 'Stationary',
        hint: 'Heavy; with Indirect Fire, acts as the spotter condition',
      },
      {
        key: 'inCover',
        label: 'Target in cover',
        hint: '-1 BS on the firer (stacks beyond the ±1 cap)',
      },
      {
        key: 'engaged',
        label: 'Engaged',
        hint: 'Close-quarters: -1 to hit ranged, Heavy bonus lost',
      },
      {
        key: 'indirectFire',
        label: 'Indirect fire',
        hint: 'Target gains cover, no hit re-rolls, harsh roll floors',
      },
    ],
  },
}

export const editionUiFor = (edition: string): EditionUi =>
  editionUi[edition] ?? editionUi['10e']
