// Abilities that leaders and stratagems conditionally grant to weapons.
// Stored per weapon row as short codes (state and share URLs); mapped to
// keyword strings the engines already parse. "Anti-* N+" is the manual
// wildcard form: it crits wounds against the current target regardless of
// its keywords, since the user judges whether the grant applies.

export interface ExtraAbility {
  code: string
  keyword: string
  label: string
  /** Codes in the same group are mutually exclusive */
  group?: string
}

export const EXTRA_ABILITIES: ExtraAbility[] = [
  { code: 'LH', keyword: 'Lethal Hits', label: 'Lethal Hits' },
  {
    code: 'S1',
    keyword: 'Sustained Hits 1',
    label: 'Sustained 1',
    group: 'sustained',
  },
  {
    code: 'S2',
    keyword: 'Sustained Hits 2',
    label: 'Sustained 2',
    group: 'sustained',
  },
  { code: 'DW', keyword: 'Devastating Wounds', label: 'Dev Wounds' },
  { code: 'TL', keyword: 'Twin-linked', label: 'Twin-linked' },
  { code: 'IC', keyword: 'Ignores Cover', label: 'Ignores Cover' },
  { code: 'A4', keyword: 'Anti-* 4+', label: 'Anti 4+', group: 'anti' },
  { code: 'A3', keyword: 'Anti-* 3+', label: 'Anti 3+', group: 'anti' },
  { code: 'A2', keyword: 'Anti-* 2+', label: 'Anti 2+', group: 'anti' },
]

const byCode = new Map(EXTRA_ABILITIES.map((a) => [a.code, a]))

export const extraKeywords = (codes: string[]): string[] =>
  codes
    .map((c) => byCode.get(c)?.keyword)
    .filter((k): k is string => k !== undefined)

export const extraLabels = (codes: string[]): string[] =>
  codes
    .map((c) => byCode.get(c)?.label)
    .filter((l): l is string => l !== undefined)

/** Toggle a code on/off, enforcing mutual-exclusion groups */
export function toggleExtra(codes: string[], code: string): string[] {
  if (codes.includes(code)) return codes.filter((c) => c !== code)
  const ability = byCode.get(code)
  if (!ability) return codes
  return [
    ...codes.filter(
      (c) => !ability.group || byCode.get(c)?.group !== ability.group,
    ),
    code,
  ]
}
