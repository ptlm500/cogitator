import type { BSDocument, BSNode } from './parse.ts'
import type {
  Ability,
  FactionFile,
  Model,
  PointsTier,
  SizeCount,
  SizePool,
  Statline,
  Unit,
  UnitSize,
  Weapon,
  WeaponProfile,
  WeaponRef,
} from '../src/data/types.ts'

// --- helpers over the parsed XML shape -------------------------------------

function kids(
  node: BSNode | undefined,
  container: string,
  tag: string,
): BSNode[] {
  const c = node?.[container] as BSNode | undefined
  return (c?.[tag] as BSNode[] | undefined) ?? []
}

const entries = (n?: BSNode) => kids(n, 'selectionEntries', 'selectionEntry')
const groups = (n?: BSNode) =>
  kids(n, 'selectionEntryGroups', 'selectionEntryGroup')
const entryLinks = (n?: BSNode) => kids(n, 'entryLinks', 'entryLink')
const profilesOf = (n?: BSNode) => kids(n, 'profiles', 'profile')
const infoLinks = (n?: BSNode) => kids(n, 'infoLinks', 'infoLink')
const constraintsOf = (n?: BSNode) => kids(n, 'constraints', 'constraint')
const categoryLinks = (n?: BSNode) => kids(n, 'categoryLinks', 'categoryLink')
const costsOf = (n?: BSNode) => kids(n, 'costs', 'cost')
const modifiersOf = (n?: BSNode) => kids(n, 'modifiers', 'modifier')
const characteristicsOf = (n?: BSNode) =>
  kids(n, 'characteristics', 'characteristic')

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function charMap(profile: BSNode): Record<string, string> {
  const out: Record<string, string> = {}
  for (const c of characteristicsOf(profile)) {
    out[str(c.name)] = str(c['#text'])
  }
  return out
}

// --- global id index --------------------------------------------------------

export class BsIndex {
  byId = new Map<string, BSNode>()
  ptsCostTypeId = ''

  constructor(docs: BSDocument[]) {
    for (const doc of docs) {
      this.walk(doc.root)
      for (const ct of kids(doc.root, 'costTypes', 'costType')) {
        if (ct.name === 'pts') this.ptsCostTypeId = str(ct.id)
      }
    }
  }

  private walk(node: unknown): void {
    if (Array.isArray(node)) {
      for (const item of node) this.walk(item)
      return
    }
    if (typeof node !== 'object' || node === null) return
    const obj = node as BSNode
    const id = obj.id
    if (typeof id === 'string') this.byId.set(id, obj)
    for (const value of Object.values(obj)) this.walk(value)
  }

  resolve(targetId: unknown): BSNode | undefined {
    return typeof targetId === 'string' ? this.byId.get(targetId) : undefined
  }
}

// --- extraction -------------------------------------------------------------

interface ResolvedChild {
  /** the selection entry or group (link targets resolved) */
  node: BSNode
  /** the entryLink it came through, if any (carries extra constraints) */
  link?: BSNode
}

// Subtrees linked into units that aren't part of the base datasheet:
// Crusade bookkeeping and detachment-specific enhancements
const SKIPPED_CHILDREN = new Set(['Crusade', 'Enhancements'])

// --- visibility -------------------------------------------------------------
//
// BSData shares wargear subtrees across datasheets and specialises them with
// `hidden` attributes plus `set hidden` modifiers conditioned on the unit's
// identity (e.g. the shared T'au "Drones" group hides its Missile Drone for
// every unit that isn't a Broadside). We evaluate the statically-knowable
// part of that: instanceOf/notInstanceOf conditions with ancestor scope,
// checked against the ids and categories of the unit being extracted.
// Anything else (selection counts, force/roster state) is 'unknown' and the
// modifier is skipped, so we never hide based on a guess.

/** Ids identifying the unit being extracted: its entry, link, categories,
 * owning catalogue, and the entries walked through on the way down. */
export type AncestorContext = Set<string>

type Verdict = boolean | 'unknown'

function combine(op: 'and' | 'or', verdicts: Verdict[]): Verdict {
  if (verdicts.length === 0) return true
  if (op === 'and') {
    if (verdicts.includes(false)) return false
    return verdicts.includes('unknown') ? 'unknown' : true
  }
  if (verdicts.includes(true)) return true
  return verdicts.includes('unknown') ? 'unknown' : false
}

function evalCondition(cond: BSNode, ctx: AncestorContext): Verdict {
  if (str(cond.scope) !== 'ancestor') return 'unknown'
  const type = str(cond.type)
  if (type === 'instanceOf') return ctx.has(str(cond.childId))
  if (type === 'notInstanceOf') return !ctx.has(str(cond.childId))
  return 'unknown'
}

function evalConditionGroup(group: BSNode, ctx: AncestorContext): Verdict {
  const op = str(group.type) === 'or' ? 'or' : 'and'
  return combine(op, [
    ...kids(group, 'conditions', 'condition').map((c) => evalCondition(c, ctx)),
    ...kids(group, 'conditionGroups', 'conditionGroup').map((g) =>
      evalConditionGroup(g, ctx),
    ),
  ])
}

/** All conditions attached directly to a modifier or modifier group (AND) */
function evalOwnConditions(node: BSNode, ctx: AncestorContext): Verdict {
  return combine('and', [
    ...kids(node, 'conditions', 'condition').map((c) => evalCondition(c, ctx)),
    ...kids(node, 'conditionGroups', 'conditionGroup').map((g) =>
      evalConditionGroup(g, ctx),
    ),
  ])
}

/**
 * Apply `set hidden` modifiers (including nested modifier groups).
 *
 * Unknown verdicts resolve in favour of visibility: a hide only applies
 * when its conditions are definitively true, while a reveal applies unless
 * they are definitively false. Options gated on selection state (e.g. god
 * marks unlocking weapon groups) thus stay listed as possible loadouts.
 */
function applyHiddenModifiers(
  container: BSNode,
  ctx: AncestorContext,
  hidden: boolean,
  outer: Verdict = true,
): boolean {
  for (const m of modifiersOf(container)) {
    if (m.type !== 'set' || m.field !== 'hidden') continue
    const verdict = combine('and', [outer, evalOwnConditions(m, ctx)])
    const wantsHide = str(m.value) === 'true'
    if (wantsHide ? verdict === true : verdict !== false) hidden = wantsHide
  }
  for (const g of kids(container, 'modifierGroups', 'modifierGroup')) {
    const verdict = combine('and', [outer, evalOwnConditions(g, ctx)])
    if (verdict !== false) {
      hidden = applyHiddenModifiers(g, ctx, hidden, verdict)
    }
  }
  return hidden
}

/** Effective visibility: an element is shown only if neither the link nor
 * its target resolves to hidden after identity-conditioned modifiers. */
function isHidden(child: ResolvedChild, ctx: AncestorContext): boolean {
  if (
    applyHiddenModifiers(child.node, ctx, str(child.node.hidden) === 'true')
  ) {
    return true
  }
  if (
    child.link &&
    applyHiddenModifiers(child.link, ctx, str(child.link.hidden) === 'true')
  ) {
    return true
  }
  return false
}

function extendContext(
  ctx: AncestorContext,
  child: ResolvedChild,
): AncestorContext {
  const next = new Set(ctx)
  if (typeof child.node.id === 'string') next.add(child.node.id)
  if (child.link && typeof child.link.id === 'string') next.add(child.link.id)
  return next
}

function resolvedChildren(
  node: BSNode,
  index: BsIndex,
  ctx: AncestorContext,
): ResolvedChild[] {
  const out: ResolvedChild[] = []
  for (const e of entries(node)) out.push({ node: e })
  for (const g of groups(node)) out.push({ node: g })
  for (const l of entryLinks(node)) {
    const target = index.resolve(l.targetId)
    if (target) out.push({ node: target, link: l })
  }
  return out.filter(
    (c) =>
      !SKIPPED_CHILDREN.has(str(c.link?.name)) &&
      !SKIPPED_CHILDREN.has(str(c.node.name)) &&
      !isHidden(c, ctx),
  )
}

function constraintValue(
  node: BSNode | undefined,
  type: 'min' | 'max',
): number | undefined {
  for (const c of constraintsOf(node)) {
    if (c.type === type && c.field === 'selections' && c.scope === 'parent') {
      const v = Number(c.value)
      if (Number.isFinite(v)) return v
    }
  }
  return undefined
}

/** min/max for a resolved child, link constraints taking precedence */
function childRange(child: ResolvedChild): { min: number; max: number } {
  const min =
    constraintValue(child.link, 'min') ??
    constraintValue(child.node, 'min') ??
    0
  const max =
    constraintValue(child.link, 'max') ??
    constraintValue(child.node, 'max') ??
    Math.max(min, 1)
  return { min, max }
}

/**
 * A constraint value after applying the element's own value modifiers
 * (set / increment / decrement targeting the constraint's id) whose
 * conditions are statically, definitively true for this ancestor context —
 * e.g. a special-weapon cap that increases inside the 20-model composition
 * option ("instanceOf ancestor <option id>").
 */
function modifiedConstraintValue(
  source: BSNode | undefined,
  type: 'min' | 'max',
  ctx: AncestorContext,
): number | undefined {
  if (!source) return undefined
  let id: string | undefined
  let value: number | undefined
  for (const c of constraintsOf(source)) {
    if (c.type === type && c.field === 'selections' && c.scope === 'parent') {
      const v = Number(c.value)
      if (Number.isFinite(v)) {
        id = str(c.id)
        value = v
      }
    }
  }
  if (value === undefined) return undefined
  for (const m of modifiersOf(source)) {
    if (str(m.field) !== id || id === '') continue
    if (evalOwnConditions(m, ctx) !== true) continue
    const v = Number(m.value)
    if (!Number.isFinite(v)) continue
    if (m.type === 'set') value = v
    else if (m.type === 'increment') value += v
    else if (m.type === 'decrement') value -= v
  }
  return value
}

/** childRange honouring statically-true constraint value modifiers */
function modifiedChildRange(
  child: ResolvedChild,
  ctx: AncestorContext,
): { min: number; max: number } {
  const min =
    modifiedConstraintValue(child.link, 'min', ctx) ??
    modifiedConstraintValue(child.node, 'min', ctx) ??
    0
  const max =
    modifiedConstraintValue(child.link, 'max', ctx) ??
    modifiedConstraintValue(child.node, 'max', ctx) ??
    Math.max(min, 1)
  return { min, max }
}

function parseWeaponProfile(profile: BSNode): WeaponProfile | null {
  const typeName = str(profile.typeName)
  if (typeName !== 'Ranged Weapons' && typeName !== 'Melee Weapons') return null
  const c = charMap(profile)
  const keywords =
    c.Keywords && c.Keywords !== '-'
      ? c.Keywords.split(',').map((k) => k.trim())
      : []
  const skillRaw = typeName === 'Ranged Weapons' ? c.BS : c.WS
  return {
    name: str(profile.name),
    type: typeName === 'Ranged Weapons' ? 'ranged' : 'melee',
    range: Number.parseInt(c.Range, 10) || 0,
    attacks: c.A ?? '',
    // "N/A" (torrent weapons) -> 0
    skill: Number.parseInt(skillRaw, 10) || 0,
    strength: Number.parseInt(c.S, 10) || 0,
    ap: Math.abs(Number.parseInt(c.AP, 10) || 0),
    damage: c.D ?? '',
    keywords,
  }
}

/** Profiles on the node itself plus any reached through profile infoLinks */
function allProfiles(node: BSNode, index: BsIndex): BSNode[] {
  const out = [...profilesOf(node)]
  for (const l of infoLinks(node)) {
    if (l.type !== 'profile') continue
    const target = index.resolve(l.targetId)
    if (target) out.push(target)
  }
  return out
}

function weaponFromEntry(node: BSNode, index: BsIndex): Weapon | null {
  const profiles = allProfiles(node, index)
    .map(parseWeaponProfile)
    .filter((p): p is WeaponProfile => p !== null)
  if (profiles.length === 0) return null
  return { id: str(node.id), name: str(node.name), profiles }
}

function parseStatline(profile: BSNode): Statline {
  const c = charMap(profile)
  return {
    id: str(profile.id),
    name: str(profile.name),
    M: c.M ?? '',
    T: Number.parseInt(c.T, 10) || 0,
    SV: Number.parseInt(c.SV, 10) || 0,
    W: Number.parseInt(c.W, 10) || 0,
    LD: c.LD ?? '',
    OC: Number.parseInt(c.OC, 10) || 0,
  }
}

const INVULN_RE = /(\d)\+\s*invulnerable save/i
const FNP_RE = /feel no pain\s*(\d)\+/i

interface UnitAccumulator {
  statlines: Map<string, Statline>
  abilities: Map<string, Ability>
  weapons: Map<string, Weapon>
  models: Model[]
  looseWeapons: WeaponRef[]
  sizes: UnitSize[]
}

function collectUnitProfiles(
  node: BSNode,
  index: BsIndex,
  acc: UnitAccumulator,
): void {
  for (const p of allProfiles(node, index)) {
    const typeName = str(p.typeName)
    if (typeName === 'Unit') {
      const s = parseStatline(p)
      acc.statlines.set(s.id, s)
    } else if (typeName === 'Abilities') {
      const ability = { name: str(p.name), text: charMap(p).Description ?? '' }
      acc.abilities.set(`${ability.name}|${ability.text}`, ability)
    }
  }
}

/** A selection entry group's own min/max selection constraints */
interface GroupRange {
  min: number
  max?: number
}

/** Weapon ref plus the group-option branch (slot) it was collected under,
 * used to merge alternatives correctly before output */
type RawRef = WeaponRef & { slot?: string }

interface CollectState {
  choiceGroup?: string
  groupDefaultId?: string
  groupRange?: GroupRange
  /** true while inside the default (or min-forced) branch of every
   * enclosing choice group: only selected branches contribute defaults */
  selected: boolean
  /** the group option this branch belongs to; refs in the same slot are
   * taken together, refs in sibling slots are alternatives */
  slot?: string
  depth: number
}

/**
 * Resolve a group's effective default option. A declared
 * defaultSelectionEntryId only counts if it actually matches a child — some
 * BSData entries carry stale ids copied from sibling datasheets. A min-N
 * group (or one whose declared default dangles) with no min-forced option
 * still auto-fills in BattleScribe with its first option — mirror that by
 * treating the first visible child as the group default.
 */
function effectiveGroupDefault(
  group: BSNode,
  index: BsIndex,
  ctx: AncestorContext,
  range: GroupRange | undefined,
): string | undefined {
  const declared = str(group.defaultSelectionEntryId) || undefined
  const kids = resolvedChildren(group, index, ctx)
  if (
    declared !== undefined &&
    kids.some((k) => k.node.id === declared || k.link?.id === declared)
  ) {
    return declared
  }
  if (declared === undefined && (range?.min ?? 0) < 1) return undefined
  if (kids.some((k) => childRange(k).min >= 1)) return undefined
  const first = kids[0]
  return first
    ? str(first.link?.id) || str(first.node.id) || undefined
    : undefined
}

/**
 * Collect weapon options under a model (or unit) entry. Descends through
 * selection entry groups; a group of more than one weapon option becomes a
 * named choice group so the UI can treat its options as alternatives.
 *
 * Options without their own constraints inherit the enclosing group's
 * range (a "pick 3 from" group caps each option at 3, and its default
 * option defaults to the group minimum). Within a group only the default
 * option's branch — or min-forced options when the group has no default —
 * is treated as equipped: compound wrappers like the Helbrute's "fist with
 * combi-bolter" mark their children min-1, which means "1 if this option
 * is chosen", not "always equipped".
 */
function collectWeapons(
  node: BSNode,
  index: BsIndex,
  acc: UnitAccumulator,
  out: RawRef[],
  ctx: AncestorContext,
  cs: CollectState,
): void {
  if (cs.depth > 6) return
  const parentIsGroup = node.type === undefined
  for (const child of resolvedChildren(node, index, ctx)) {
    const { node: n, link } = child
    if (n.type === 'model' || n.type === 'unit') continue

    const ownMin = constraintValue(link, 'min') ?? constraintValue(n, 'min')
    const isGroupDefault =
      parentIsGroup &&
      cs.groupDefaultId !== undefined &&
      (n.id === cs.groupDefaultId || link?.id === cs.groupDefaultId)
    // inside a group, an option is part of the default loadout only if it
    // is the group default, or min-forced in a group without a default
    const childSelected =
      cs.selected &&
      (!parentIsGroup ||
        (cs.groupDefaultId !== undefined ? isGroupDefault : (ownMin ?? 0) >= 1))
    const childSlot = parentIsGroup
      ? str(link?.id) || str(n.id) || cs.slot
      : cs.slot

    const weapon = weaponFromEntry(n, index)
    if (weapon) {
      acc.weapons.set(weapon.id, weapon)
      const ownMax = constraintValue(link, 'max') ?? constraintValue(n, 'max')
      const min = ownMin ?? 0
      const max = ownMax ?? cs.groupRange?.max ?? Math.max(min, 1)
      const defaultCount = !childSelected
        ? 0
        : min > 0
          ? min
          : isGroupDefault
            ? Math.max(cs.groupRange?.min ?? 1, 1)
            : link?.defaultAmount
              ? 1
              : 0
      out.push({
        weaponId: weapon.id,
        defaultCount,
        max: Math.max(max, defaultCount),
        ...(cs.choiceGroup ? { choiceGroup: cs.choiceGroup } : {}),
        ...(childSlot ? { slot: childSlot } : {}),
      })
      continue
    }
    // non-weapon upgrade or group: descend
    const isGroup = n.type === undefined
    const groupCtx = extendContext(ctx, child)
    const groupRange: GroupRange | undefined = isGroup
      ? {
          min:
            constraintValue(child.link, 'min') ??
            constraintValue(n, 'min') ??
            0,
          max: constraintValue(child.link, 'max') ?? constraintValue(n, 'max'),
        }
      : cs.groupRange
    collectWeapons(n, index, acc, out, groupCtx, {
      choiceGroup: isGroup ? str(n.name) || cs.choiceGroup : cs.choiceGroup,
      groupDefaultId: isGroup
        ? effectiveGroupDefault(n, index, groupCtx, groupRange)
        : cs.groupDefaultId,
      groupRange,
      selected: childSelected,
      slot: childSlot,
      depth: cs.depth + 1,
    })
  }
}

const initialCollectState = (): CollectState => ({ selected: true, depth: 0 })

/**
 * Merge collected refs after weapon ids have been canonicalised. Refs of
 * the same weapon within one choice group are alternatives across slots
 * (max) but cumulative within a slot (sum); refs outside any choice group
 * are independent equipment (sum).
 */
function mergeWeaponRefs(
  refs: RawRef[],
  idMap: Map<string, string>,
): WeaponRef[] {
  interface Tally {
    choiceGroup?: string
    slots: Map<string, { defaultCount: number; max: number }>
  }
  const order: string[] = []
  const byKey = new Map<string, Tally>()
  for (const ref of refs) {
    const weaponId = idMap.get(ref.weaponId) ?? ref.weaponId
    const group = ref.choiceGroup ?? ''
    const key = `${group}|${weaponId}`
    let tally = byKey.get(key)
    if (!tally) {
      tally = { choiceGroup: ref.choiceGroup, slots: new Map() }
      byKey.set(key, tally)
      order.push(key)
    }
    // ungrouped refs all share one slot so they accumulate
    const slotKey = ref.choiceGroup ? (ref.slot ?? '') : ''
    const slot = tally.slots.get(slotKey) ?? { defaultCount: 0, max: 0 }
    slot.defaultCount += ref.defaultCount
    slot.max += ref.max
    tally.slots.set(slotKey, slot)
  }
  return order.map((key) => {
    const tally = byKey.get(key)!
    const weaponId = key.slice(key.indexOf('|') + 1)
    let defaultCount = 0
    let max = 0
    for (const slot of tally.slots.values()) {
      defaultCount = Math.max(defaultCount, slot.defaultCount)
      max = Math.max(max, slot.max)
    }
    return {
      weaponId,
      defaultCount,
      max,
      ...(tally.choiceGroup ? { choiceGroup: tally.choiceGroup } : {}),
    }
  })
}

/** Map each weapon id to the first id sharing its name and exact profiles,
 * so duplicate entries (e.g. the Helbrute's four fists) collapse */
function canonicalWeaponIds(weapons: Map<string, Weapon>): {
  idMap: Map<string, string>
  merged: Map<string, Weapon>
} {
  const idMap = new Map<string, string>()
  const merged = new Map<string, Weapon>()
  const bySignature = new Map<string, string>()
  for (const [id, weapon] of weapons) {
    const signature = JSON.stringify([weapon.name, weapon.profiles])
    const canonical = bySignature.get(signature)
    if (canonical) {
      idMap.set(id, canonical)
    } else {
      bySignature.set(signature, id)
      merged.set(id, weapon)
      idMap.set(id, id)
    }
  }
  return { idMap, merged }
}

function extractModel(
  child: ResolvedChild,
  index: BsIndex,
  acc: UnitAccumulator,
  ctx: AncestorContext,
): void {
  const { node } = child
  const { min, max } = childRange(child)
  // the same model entry can be linked from several unit-size options;
  // merge into one entry spanning the smallest and largest counts
  const existing = acc.models.find((m) => m.id === node.id)
  if (existing) {
    existing.min = Math.min(existing.min, min)
    existing.max = Math.max(existing.max, max)
    return
  }
  collectUnitProfiles(node, index, acc)
  const own = allProfiles(node, index).find((p) => p.typeName === 'Unit')
  const weapons: RawRef[] = []
  collectWeapons(
    node,
    index,
    acc,
    weapons,
    extendContext(ctx, child),
    initialCollectState(),
  )
  acc.models.push({
    id: str(node.id),
    name: str(node.name),
    statlineId: str(own?.id),
    min,
    max,
    weapons,
  })
}

/** Does this subtree contain a model-type entry (resolving links)? */
function subtreeHasModels(
  node: BSNode,
  index: BsIndex,
  ctx: AncestorContext,
  depth = 0,
): boolean {
  if (depth > 4) return false
  return resolvedChildren(node, index, ctx).some(
    (c) =>
      c.node.type === 'model' ||
      subtreeHasModels(c.node, index, extendContext(ctx, c), depth + 1),
  )
}

interface SizeMember {
  id: string
  min: number
  max: number
  default: number
}

/** Fill member defaults up to a group's minimum total, in document order */
function distributeDefaults(members: SizeMember[], groupMin: number): void {
  let total = members.reduce((sum, m) => sum + m.default, 0)
  for (const m of members) {
    if (total >= groupMin) break
    const add = Math.min(m.max - m.default, groupMin - total)
    if (add > 0) {
      m.default += add
      total += add
    }
  }
}

/**
 * Collect the model entries reachable under one composition option, with
 * counts evaluated in that option's ancestor context (so size-conditional
 * constraint modifiers apply). A nested group that caps its selections and
 * holds several members becomes a pool (e.g. "up to 2 special weapons");
 * a group minimum fills member defaults in document order, mirroring
 * BattleScribe's auto-fill of the standard composition.
 */
function sizeMembersOf(
  container: BSNode,
  index: BsIndex,
  ctx: AncestorContext,
  pools: SizePool[],
  depth = 0,
): SizeMember[] {
  if (depth > 4) return []
  const members: SizeMember[] = []
  for (const child of resolvedChildren(container, index, ctx)) {
    const n = child.node
    const childCtx = extendContext(ctx, child)
    if (n.type === 'model') {
      const { min, max } = modifiedChildRange(child, ctx)
      members.push({ id: str(n.id), min, max, default: min })
    } else if (n.type === undefined) {
      const sub = sizeMembersOf(n, index, childCtx, pools, depth + 1)
      if (sub.length === 0) continue
      const min =
        modifiedConstraintValue(child.link, 'min', ctx) ??
        modifiedConstraintValue(n, 'min', childCtx) ??
        0
      const max =
        modifiedConstraintValue(child.link, 'max', ctx) ??
        modifiedConstraintValue(n, 'max', childCtx)
      if (max !== undefined && sub.length >= 2) {
        pools.push({
          label: str(n.name),
          max,
          modelIds: sub.map((m) => m.id),
        })
      }
      if (min > 0) distributeDefaults(sub, min)
      members.push(...sub)
    } else if (n.type !== 'unit') {
      members.push(...sizeMembersOf(n, index, childCtx, pools, depth + 1))
    }
  }
  return members
}

/**
 * Extract unit-size options from a composition group: a pick-1 group whose
 * options each wrap a different set of model counts (BSData's
 * "Unit Composition" pattern — Cadian Shock Troops, Burna Boyz, ...).
 */
function extractSizes(
  group: BSNode,
  index: BsIndex,
  acc: UnitAccumulator,
  ctx: AncestorContext,
): void {
  for (const opt of resolvedChildren(group, index, ctx)) {
    if (opt.node.type === 'model') continue
    const optCtx = extendContext(ctx, opt)
    if (!subtreeHasModels(opt.node, index, optCtx)) continue
    const pools: SizePool[] = []
    const members = sizeMembersOf(opt.node, index, optCtx, pools)
    if (members.length === 0) continue
    const models: Record<string, SizeCount> = {}
    for (const m of members) {
      const cur = models[m.id]
      models[m.id] = cur
        ? {
            min: cur.min + m.min,
            max: cur.max + m.max,
            default: cur.default + m.default,
          }
        : { min: m.min, max: m.max, default: m.default }
    }
    acc.sizes.push({
      id: str(opt.link?.id) || str(opt.node.id),
      label: str(opt.node.name),
      models,
      ...(pools.length > 0 ? { pools } : {}),
    })
  }
}

function walkUnitChildren(
  node: BSNode,
  index: BsIndex,
  acc: UnitAccumulator,
  ctx: AncestorContext,
  depth = 0,
): void {
  if (depth > 6) return
  for (const child of resolvedChildren(node, index, ctx)) {
    const n = child.node
    const childCtx = extendContext(ctx, child)
    if (n.type === 'model') {
      extractModel(child, index, acc, ctx)
    } else if (n.type === undefined) {
      // selection entry group: a pick-1 group whose options wrap models is
      // a unit-size composition choice
      if (acc.sizes.length === 0) {
        const { min, max } = childRange(child)
        if (min === 1 && max === 1) {
          const options = resolvedChildren(n, index, childCtx).filter(
            (c) =>
              c.node.type !== 'model' &&
              subtreeHasModels(c.node, index, extendContext(childCtx, c)),
          )
          if (options.length >= 2) extractSizes(n, index, acc, childCtx)
        }
      }
      walkUnitChildren(n, index, acc, childCtx, depth + 1)
    } else if (n.type === 'unit') {
      collectUnitProfiles(n, index, acc)
      walkUnitChildren(n, index, acc, childCtx, depth + 1)
    } else {
      // upgrade at unit level: may carry weapons (vehicles), abilities, or
      // wrap models (unit-size option entries like "2 Spanners and 8 Burna Boyz")
      collectUnitProfiles(n, index, acc)
      const weapon = weaponFromEntry(n, index)
      if (weapon) {
        acc.weapons.set(weapon.id, weapon)
        const { min, max } = childRange(child)
        acc.looseWeapons.push({
          weaponId: weapon.id,
          defaultCount: min,
          max: Math.max(max, min),
        })
      } else if (subtreeHasModels(n, index, childCtx)) {
        walkUnitChildren(n, index, acc, childCtx, depth + 1)
      } else {
        collectWeapons(n, index, acc, acc.looseWeapons, childCtx, {
          ...initialCollectState(),
          depth: depth + 1,
        })
      }
    }
  }
}

function extractPoints(
  node: BSNode,
  index: BsIndex,
  link?: BSNode,
): PointsTier[] {
  const tiers: PointsTier[] = []
  const sources = link ? [link, node] : [node]
  for (const source of sources) {
    for (const cost of costsOf(source)) {
      if (cost.name === 'pts') {
        const pts = Number(cost.value)
        if (pts > 0) tiers.push({ pts })
      }
    }
    if (tiers.length > 0) {
      for (const m of modifiersOf(source)) {
        if (m.type !== 'set' || m.field !== index.ptsCostTypeId) continue
        for (const cond of kids(m, 'conditions', 'condition')) {
          if (cond.type === 'atLeast' && cond.field === 'selections') {
            tiers.push({ atLeast: Number(cond.value), pts: Number(m.value) })
          }
        }
      }
      break
    }
  }
  return tiers.sort((a, b) => (a.atLeast ?? 0) - (b.atLeast ?? 0))
}

export function extractUnit(
  node: BSNode,
  index: BsIndex,
  link?: BSNode,
  rootIds: string[] = [],
): Unit | null {
  if (node.type !== 'unit' && node.type !== 'model') return null
  const acc: UnitAccumulator = {
    statlines: new Map(),
    abilities: new Map(),
    weapons: new Map(),
    models: [],
    looseWeapons: [],
    sizes: [],
  }
  // identity for visibility conditions: the unit entry, the link it was
  // reached through, its categories, and the owning catalogue
  const ctx: AncestorContext = new Set(rootIds)
  if (typeof node.id === 'string') ctx.add(node.id)
  if (link && typeof link.id === 'string') ctx.add(str(link.id))
  for (const c of categoryLinks(node)) {
    if (typeof c.targetId === 'string') ctx.add(c.targetId)
  }

  collectUnitProfiles(node, index, acc)
  walkUnitChildren(node, index, acc, ctx)

  // single-model unit: the unit entry is the model
  if (node.type === 'model' && acc.models.length === 0) {
    const weapons: RawRef[] = []
    collectWeapons(node, index, acc, weapons, ctx, initialCollectState())
    acc.models.push({
      id: str(node.id),
      name: str(node.name),
      statlineId: '',
      min: 1,
      max: 1,
      weapons,
    })
    acc.looseWeapons = []
  }

  if (acc.statlines.size === 0) return null

  const statlines = [...acc.statlines.values()]
  // models without their own statline: match by name, else the unit's first
  for (const model of acc.models) {
    if (model.statlineId) continue
    const match = statlines.find(
      (s) => model.name.includes(s.name) || s.name.includes(model.name),
    )
    model.statlineId = (match ?? statlines[0]).id
  }

  // collapse duplicate weapon entries (same name + identical profiles)
  // and merge each model's refs with alternative-aware limits
  const { idMap, merged } = canonicalWeaponIds(acc.weapons)
  for (const model of acc.models) {
    model.weapons = mergeWeaponRefs(model.weapons as RawRef[], idMap)
  }
  const looseWeapons = mergeWeaponRefs(acc.looseWeapons as RawRef[], idMap)

  const name = str(node.name)
  const abilities = [...acc.abilities.values()]
  // dedicated "Invulnerable Save" abilities usually have a bare "4+" as text
  const invulnAbility = abilities.find((a) => /invulnerable save/i.test(a.name))
  const abilityText = abilities.map((a) => `${a.name}: ${a.text}`).join('\n')
  const invuln =
    /(\d)\+/.exec(invulnAbility?.text ?? '')?.[1] ??
    INVULN_RE.exec(abilityText)?.[1]
  const fnp = FNP_RE.exec(abilityText)?.[1]

  const unit: Unit = {
    id: str(node.id),
    name,
    keywords: categoryLinks(node).map((c) => str(c.name)),
    abilities,
    points: extractPoints(node, index, link),
    statlines,
    models: acc.models,
    weapons: Object.fromEntries(merged),
    looseWeapons,
  }
  if (acc.sizes.length >= 2) unit.sizes = acc.sizes
  if (/\[legends\]/i.test(name)) unit.legends = true
  if (invuln) unit.invuln = Number(invuln)
  if (fnp) unit.feelNoPain = Number(fnp)
  return unit
}

export function extractFaction(
  doc: BSDocument,
  index: BsIndex,
  sha: string,
  edition: string,
): FactionFile | null {
  const root = doc.root
  if (doc.kind !== 'catalogue' || root.library === 'true') return null

  const units: Unit[] = []
  const seen = new Set<string>()
  const rootIds = typeof root.id === 'string' ? [root.id] : []
  const addUnit = (node: BSNode, link?: BSNode) => {
    const unit = extractUnit(node, index, link, rootIds)
    if (unit && !seen.has(unit.id)) {
      seen.add(unit.id)
      units.push(unit)
    }
  }
  for (const l of entryLinks(root)) {
    const target = index.resolve(l.targetId)
    if (target) addUnit(target, l)
  }
  for (const e of entries(root)) addUnit(e)
  for (const e of kids(root, 'sharedSelectionEntries', 'selectionEntry')) {
    addUnit(e)
  }

  if (units.length === 0) return null
  units.sort((a, b) => a.name.localeCompare(b.name))
  return {
    schema: 1,
    edition,
    sha,
    id: str(root.id),
    name: str(root.name),
    units,
  }
}
