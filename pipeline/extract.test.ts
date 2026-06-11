import { describe, expect, it } from 'vitest'
import { BsIndex, extractFaction, extractUnit } from './extract.ts'
import { parseBsXml } from './parse.ts'

const GST = `<?xml version="1.0" encoding="UTF-8"?>
<gameSystem id="sys-1" name="Test 40k" revision="1" battleScribeVersion="2.03" xmlns="http://www.battlescribe.net/schema/gameSystemSchema">
  <costTypes>
    <costType id="pts-id" name="pts" defaultCostLimit="-1"/>
  </costTypes>
  <profileTypes>
    <profileType id="pt-unit" name="Unit"/>
    <profileType id="pt-ranged" name="Ranged Weapons"/>
    <profileType id="pt-melee" name="Melee Weapons"/>
    <profileType id="pt-abilities" name="Abilities"/>
  </profileTypes>
</gameSystem>`

const CAT = `<?xml version="1.0" encoding="UTF-8"?>
<catalogue id="cat-1" name="Test Faction" revision="1" library="false" gameSystemId="sys-1" battleScribeVersion="2.03" xmlns="http://www.battlescribe.net/schema/catalogueSchema">
  <entryLinks>
    <entryLink id="link-squad" name="Test Squad" type="selectionEntry" targetId="unit-squad"/>
    <entryLink id="link-hero" name="Test Hero" type="selectionEntry" targetId="unit-hero"/>
  </entryLinks>
  <sharedSelectionEntries>
    <selectionEntry id="unit-squad" name="Test Squad" type="unit" hidden="false">
      <modifiers>
        <modifier type="set" value="200" field="pts-id">
          <conditions>
            <condition type="atLeast" value="10" field="selections" scope="grp-troopers"/>
          </conditions>
        </modifier>
      </modifiers>
      <profiles>
        <profile id="prof-squad" name="Test Trooper" typeName="Unit" typeId="pt-unit">
          <characteristics>
            <characteristic name="M" typeId="c-m">6"</characteristic>
            <characteristic name="T" typeId="c-t">4</characteristic>
            <characteristic name="SV" typeId="c-sv">3+</characteristic>
            <characteristic name="W" typeId="c-w">2</characteristic>
            <characteristic name="LD" typeId="c-ld">6+</characteristic>
            <characteristic name="OC" typeId="c-oc">2</characteristic>
          </characteristics>
        </profile>
      </profiles>
      <categoryLinks>
        <categoryLink id="cl-1" name="Infantry" targetId="cat-infantry"/>
        <categoryLink id="cl-2" name="Faction: Test" targetId="cat-faction"/>
      </categoryLinks>
      <costs>
        <cost name="pts" typeId="pts-id" value="100"/>
      </costs>
      <selectionEntries>
        <selectionEntry id="model-sgt" name="Test Sergeant" type="model" hidden="false">
          <constraints>
            <constraint type="min" value="1" field="selections" scope="parent" id="cn-1"/>
            <constraint type="max" value="1" field="selections" scope="parent" id="cn-2"/>
          </constraints>
          <selectionEntryGroups>
            <selectionEntryGroup id="grp-sgt-melee" name="Sergeant Melee" defaultSelectionEntryId="link-chainsword" hidden="false">
              <entryLinks>
                <entryLink id="link-chainsword" name="Chainsword" type="selectionEntry" targetId="wpn-chainsword"/>
                <entryLink id="link-fist" name="Power fist" type="selectionEntry" targetId="wpn-fist"/>
              </entryLinks>
            </selectionEntryGroup>
          </selectionEntryGroups>
        </selectionEntry>
      </selectionEntries>
      <selectionEntryGroups>
        <selectionEntryGroup id="grp-troopers" name="Troopers" hidden="false">
          <constraints>
            <constraint type="min" value="4" field="selections" scope="parent" id="cn-3"/>
            <constraint type="max" value="9" field="selections" scope="parent" id="cn-4"/>
          </constraints>
          <selectionEntries>
            <selectionEntry id="model-trooper" name="Test Trooper" type="model" hidden="false">
              <constraints>
                <constraint type="max" value="9" field="selections" scope="parent" id="cn-5"/>
              </constraints>
              <entryLinks>
                <entryLink id="link-rifle" name="Test Rifle" type="selectionEntry" targetId="wpn-rifle">
                  <constraints>
                    <constraint type="min" value="1" field="selections" scope="parent" id="cn-6"/>
                  </constraints>
                </entryLink>
                <entryLink id="link-pods-squad" name="Pods" type="selectionEntryGroup" targetId="grp-pods"/>
              </entryLinks>
            </selectionEntry>
          </selectionEntries>
        </selectionEntryGroup>
      </selectionEntryGroups>
    </selectionEntry>
    <selectionEntry id="unit-hero" name="Test Hero" type="model" hidden="false">
      <profiles>
        <profile id="prof-hero" name="Test Hero" typeName="Unit" typeId="pt-unit">
          <characteristics>
            <characteristic name="M" typeId="c-m">6"</characteristic>
            <characteristic name="T" typeId="c-t">5</characteristic>
            <characteristic name="SV" typeId="c-sv">2+</characteristic>
            <characteristic name="W" typeId="c-w">5</characteristic>
            <characteristic name="LD" typeId="c-ld">5+</characteristic>
            <characteristic name="OC" typeId="c-oc">1</characteristic>
          </characteristics>
        </profile>
        <profile id="prof-inv" name="Invulnerable Save" typeName="Abilities" typeId="pt-abilities">
          <characteristics>
            <characteristic name="Description" typeId="c-desc">4+</characteristic>
          </characteristics>
        </profile>
        <profile id="prof-fnp" name="Stubborn" typeName="Abilities" typeId="pt-abilities">
          <characteristics>
            <characteristic name="Description" typeId="c-desc">This model has the Feel No Pain 5+ ability.</characteristic>
          </characteristics>
        </profile>
      </profiles>
      <costs>
        <cost name="pts" typeId="pts-id" value="80"/>
      </costs>
      <categoryLinks>
        <categoryLink id="cl-h" name="Hero" targetId="cat-hero"/>
      </categoryLinks>
      <entryLinks>
        <entryLink id="link-hero-fist" name="Power fist" type="selectionEntry" targetId="wpn-fist">
          <constraints>
            <constraint type="min" value="1" field="selections" scope="parent" id="cn-7"/>
          </constraints>
        </entryLink>
        <entryLink id="link-pods-hero" name="Pods" type="selectionEntryGroup" targetId="grp-pods"/>
      </entryLinks>
      <selectionEntryGroups>
        <selectionEntryGroup id="grp-hardpoints" name="Hardpoints" defaultSelectionEntryId="hp-rifle" hidden="false">
          <constraints>
            <constraint type="min" value="3" field="selections" scope="parent" id="cn-hp1"/>
            <constraint type="max" value="3" field="selections" scope="parent" id="cn-hp2"/>
          </constraints>
          <entryLinks>
            <entryLink id="hp-rifle" name="Test Rifle" type="selectionEntry" targetId="wpn-rifle"/>
            <entryLink id="hp-chainsword" name="Chainsword" type="selectionEntry" targetId="wpn-chainsword"/>
          </entryLinks>
        </selectionEntryGroup>
      </selectionEntryGroups>
    </selectionEntry>
    <selectionEntry id="wpn-rifle" name="Test Rifle" type="upgrade" hidden="false">
      <profiles>
        <profile id="prof-rifle" name="Test Rifle" typeName="Ranged Weapons" typeId="pt-ranged">
          <characteristics>
            <characteristic name="Range" typeId="c-range">24"</characteristic>
            <characteristic name="A" typeId="c-a">2</characteristic>
            <characteristic name="BS" typeId="c-bs">3+</characteristic>
            <characteristic name="S" typeId="c-s">4</characteristic>
            <characteristic name="AP" typeId="c-ap">-1</characteristic>
            <characteristic name="D" typeId="c-d">1</characteristic>
            <characteristic name="Keywords" typeId="c-kw">Rapid Fire 1, Lethal Hits</characteristic>
          </characteristics>
        </profile>
      </profiles>
    </selectionEntry>
    <selectionEntry id="wpn-chainsword" name="Chainsword" type="upgrade" hidden="false">
      <profiles>
        <profile id="prof-chainsword" name="Chainsword" typeName="Melee Weapons" typeId="pt-melee">
          <characteristics>
            <characteristic name="Range" typeId="c-range">Melee</characteristic>
            <characteristic name="A" typeId="c-a">4</characteristic>
            <characteristic name="WS" typeId="c-ws">3+</characteristic>
            <characteristic name="S" typeId="c-s">4</characteristic>
            <characteristic name="AP" typeId="c-ap">0</characteristic>
            <characteristic name="D" typeId="c-d">1</characteristic>
            <characteristic name="Keywords" typeId="c-kw">-</characteristic>
          </characteristics>
        </profile>
      </profiles>
    </selectionEntry>
    <selectionEntry id="wpn-fist" name="Power fist" type="upgrade" hidden="false">
      <profiles>
        <profile id="prof-fist" name="Power fist" typeName="Melee Weapons" typeId="pt-melee">
          <characteristics>
            <characteristic name="Range" typeId="c-range">Melee</characteristic>
            <characteristic name="A" typeId="c-a">3</characteristic>
            <characteristic name="WS" typeId="c-ws">3+</characteristic>
            <characteristic name="S" typeId="c-s">8</characteristic>
            <characteristic name="AP" typeId="c-ap">-2</characteristic>
            <characteristic name="D" typeId="c-d">2</characteristic>
            <characteristic name="Keywords" typeId="c-kw">-</characteristic>
          </characteristics>
        </profile>
      </profiles>
    </selectionEntry>
    <selectionEntry id="wpn-heropod" name="Hero Pod" type="upgrade" hidden="false">
      <profiles>
        <profile id="prof-heropod" name="Hero Pod" typeName="Ranged Weapons" typeId="pt-ranged">
          <characteristics>
            <characteristic name="Range" typeId="c-range">30"</characteristic>
            <characteristic name="A" typeId="c-a">2</characteristic>
            <characteristic name="BS" typeId="c-bs">3+</characteristic>
            <characteristic name="S" typeId="c-s">7</characteristic>
            <characteristic name="AP" typeId="c-ap">-1</characteristic>
            <characteristic name="D" typeId="c-d">2</characteristic>
            <characteristic name="Keywords" typeId="c-kw">-</characteristic>
          </characteristics>
        </profile>
      </profiles>
    </selectionEntry>
    <selectionEntry id="wpn-squadpod" name="Squad Pod" type="upgrade" hidden="false">
      <profiles>
        <profile id="prof-squadpod" name="Squad Pod" typeName="Ranged Weapons" typeId="pt-ranged">
          <characteristics>
            <characteristic name="Range" typeId="c-range">18"</characteristic>
            <characteristic name="A" typeId="c-a">1</characteristic>
            <characteristic name="BS" typeId="c-bs">3+</characteristic>
            <characteristic name="S" typeId="c-s">5</characteristic>
            <characteristic name="AP" typeId="c-ap">0</characteristic>
            <characteristic name="D" typeId="c-d">1</characteristic>
            <characteristic name="Keywords" typeId="c-kw">-</characteristic>
          </characteristics>
        </profile>
      </profiles>
    </selectionEntry>
    <selectionEntry id="wpn-unlockpod" name="Unlockable Pod" type="upgrade" hidden="false">
      <profiles>
        <profile id="prof-unlockpod" name="Unlockable Pod" typeName="Ranged Weapons" typeId="pt-ranged">
          <characteristics>
            <characteristic name="Range" typeId="c-range">12"</characteristic>
            <characteristic name="A" typeId="c-a">1</characteristic>
            <characteristic name="BS" typeId="c-bs">3+</characteristic>
            <characteristic name="S" typeId="c-s">4</characteristic>
            <characteristic name="AP" typeId="c-ap">0</characteristic>
            <characteristic name="D" typeId="c-d">1</characteristic>
            <characteristic name="Keywords" typeId="c-kw">-</characteristic>
          </characteristics>
        </profile>
      </profiles>
    </selectionEntry>
    <selectionEntry id="wpn-neverpod" name="Never Pod" type="upgrade" hidden="false">
      <profiles>
        <profile id="prof-neverpod" name="Never Pod" typeName="Ranged Weapons" typeId="pt-ranged">
          <characteristics>
            <characteristic name="Range" typeId="c-range">12"</characteristic>
            <characteristic name="A" typeId="c-a">1</characteristic>
            <characteristic name="BS" typeId="c-bs">3+</characteristic>
            <characteristic name="S" typeId="c-s">4</characteristic>
            <characteristic name="AP" typeId="c-ap">0</characteristic>
            <characteristic name="D" typeId="c-d">1</characteristic>
            <characteristic name="Keywords" typeId="c-kw">-</characteristic>
          </characteristics>
        </profile>
      </profiles>
    </selectionEntry>
  </sharedSelectionEntries>
  <sharedSelectionEntryGroups>
    <selectionEntryGroup id="grp-pods" name="Pods" hidden="false">
      <entryLinks>
        <entryLink id="lp-hero" name="Hero Pod" type="selectionEntry" targetId="wpn-heropod" hidden="false">
          <modifiers>
            <modifier type="set" value="true" field="hidden">
              <conditions>
                <condition type="notInstanceOf" value="1" field="selections" scope="ancestor" childId="cat-hero" id="cnd-1"/>
              </conditions>
            </modifier>
          </modifiers>
        </entryLink>
        <entryLink id="lp-squad" name="Squad Pod" type="selectionEntry" targetId="wpn-squadpod" hidden="true">
          <modifiers>
            <modifier type="set" value="false" field="hidden">
              <conditions>
                <condition type="instanceOf" value="1" field="selections" scope="ancestor" childId="cat-infantry" id="cnd-2"/>
              </conditions>
            </modifier>
          </modifiers>
        </entryLink>
        <entryLink id="lp-unlock" name="Unlockable Pod" type="selectionEntry" targetId="wpn-unlockpod" hidden="true">
          <modifiers>
            <modifier type="set" value="false" field="hidden">
              <conditions>
                <condition type="atLeast" value="1" field="selections" scope="parent" childId="wpn-rifle" id="cnd-3"/>
              </conditions>
            </modifier>
          </modifiers>
        </entryLink>
        <entryLink id="lp-never" name="Never Pod" type="selectionEntry" targetId="wpn-neverpod" hidden="true"/>
      </entryLinks>
    </selectionEntryGroup>
  </sharedSelectionEntryGroups>
</catalogue>`

function setup() {
  const gst = parseBsXml(GST, 'test.gst')
  const cat = parseBsXml(CAT, 'test.cat')
  const index = new BsIndex([gst, cat])
  return { gst, cat, index }
}

describe('extractFaction', () => {
  it('extracts units from a non-library catalogue', () => {
    const { cat, index } = setup()
    const faction = extractFaction(cat, index, 'abc123', '10e')
    expect(faction).not.toBeNull()
    expect(faction!.name).toBe('Test Faction')
    expect(faction!.units.map((u) => u.name)).toEqual([
      'Test Hero',
      'Test Squad',
    ])
  })

  it('returns null for library catalogues', () => {
    const { index } = setup()
    const lib = parseBsXml(
      CAT.replace('library="false"', 'library="true"'),
      'lib.cat',
    )
    expect(extractFaction(lib, index, 'abc123', '10e')).toBeNull()
  })
})

describe('extractUnit', () => {
  it('extracts a multi-model unit with statline, models, and keywords', () => {
    const { index } = setup()
    const unit = extractUnit(index.resolve('unit-squad')!, index)!
    expect(unit.name).toBe('Test Squad')
    expect(unit.keywords).toEqual(['Infantry', 'Faction: Test'])
    expect(unit.statlines).toEqual([
      {
        id: 'prof-squad',
        name: 'Test Trooper',
        M: '6"',
        T: 4,
        SV: 3,
        W: 2,
        LD: '6+',
        OC: 2,
      },
    ])
    expect(unit.models.map((m) => [m.name, m.min, m.max])).toEqual([
      ['Test Sergeant', 1, 1],
      ['Test Trooper', 0, 9],
    ])
  })

  it('extracts weapon profiles through entry links', () => {
    const { index } = setup()
    const unit = extractUnit(index.resolve('unit-squad')!, index)!
    const trooper = unit.models.find((m) => m.name === 'Test Trooper')!
    expect(trooper.weapons).toEqual([
      { weaponId: 'wpn-rifle', defaultCount: 1, max: 1 },
      {
        weaponId: 'wpn-squadpod',
        defaultCount: 0,
        max: 1,
        choiceGroup: 'Pods',
      },
      {
        weaponId: 'wpn-unlockpod',
        defaultCount: 0,
        max: 1,
        choiceGroup: 'Pods',
      },
    ])
    expect(unit.weapons['wpn-rifle'].profiles).toEqual([
      {
        name: 'Test Rifle',
        type: 'ranged',
        range: 24,
        attacks: '2',
        skill: 3,
        strength: 4,
        ap: 1,
        damage: '1',
        keywords: ['Rapid Fire 1', 'Lethal Hits'],
      },
    ])
  })

  it('marks choice groups and applies group defaults', () => {
    const { index } = setup()
    const unit = extractUnit(index.resolve('unit-squad')!, index)!
    const sgt = unit.models.find((m) => m.name === 'Test Sergeant')!
    expect(sgt.weapons).toEqual([
      {
        weaponId: 'wpn-chainsword',
        defaultCount: 1,
        max: 1,
        choiceGroup: 'Sergeant Melee',
      },
      {
        weaponId: 'wpn-fist',
        defaultCount: 0,
        max: 1,
        choiceGroup: 'Sergeant Melee',
      },
    ])
  })

  it('extracts tiered points costs', () => {
    const { index } = setup()
    const unit = extractUnit(index.resolve('unit-squad')!, index)!
    expect(unit.points).toEqual([{ pts: 100 }, { atLeast: 10, pts: 200 }])
  })

  it('treats a model-type entry as a single-model unit', () => {
    const { index } = setup()
    const unit = extractUnit(index.resolve('unit-hero')!, index)!
    expect(unit.models).toHaveLength(1)
    expect(unit.models[0]).toMatchObject({ name: 'Test Hero', min: 1, max: 1 })
    expect(unit.models[0].weapons).toEqual([
      {
        weaponId: 'wpn-rifle',
        defaultCount: 3,
        max: 3,
        choiceGroup: 'Hardpoints',
      },
      {
        weaponId: 'wpn-chainsword',
        defaultCount: 0,
        max: 3,
        choiceGroup: 'Hardpoints',
      },
      { weaponId: 'wpn-fist', defaultCount: 1, max: 1 },
      { weaponId: 'wpn-heropod', defaultCount: 0, max: 1, choiceGroup: 'Pods' },
      {
        weaponId: 'wpn-unlockpod',
        defaultCount: 0,
        max: 1,
        choiceGroup: 'Pods',
      },
    ])
  })

  it('parses invulnerable save and feel no pain from abilities', () => {
    const { index } = setup()
    const unit = extractUnit(index.resolve('unit-hero')!, index)!
    expect(unit.invuln).toBe(4)
    expect(unit.feelNoPain).toBe(5)
  })

  it('melee profiles have range 0 and the WS as skill', () => {
    const { index } = setup()
    const unit = extractUnit(index.resolve('unit-squad')!, index)!
    const chainsword = unit.weapons['wpn-chainsword'].profiles[0]
    expect(chainsword).toMatchObject({ type: 'melee', range: 0, skill: 3 })
  })

  it('returns null for entries without a unit statline', () => {
    const { index } = setup()
    expect(extractUnit(index.resolve('wpn-rifle')!, index)).toBeNull()
  })
})

describe('group selection ranges', () => {
  it('options inherit a pick-N group range and its default fills the minimum', () => {
    const { index } = setup()
    const unit = extractUnit(index.resolve('unit-hero')!, index)!
    const hero = unit.models[0]
    const inGroup = hero.weapons.filter((w) => w.choiceGroup === 'Hardpoints')
    expect(inGroup).toEqual([
      {
        weaponId: 'wpn-rifle',
        defaultCount: 3,
        max: 3,
        choiceGroup: 'Hardpoints',
      },
      {
        weaponId: 'wpn-chainsword',
        defaultCount: 0,
        max: 3,
        choiceGroup: 'Hardpoints',
      },
    ])
  })
})

describe('visibility', () => {
  const weaponNames = (unitId: string) => {
    const { index } = setup()
    const unit = extractUnit(index.resolve(unitId)!, index)!
    return Object.values(unit.weapons).map((w) => w.name)
  }

  it('hides options whose identity conditions exclude the unit', () => {
    // visible by default, but "set hidden when notInstanceOf Hero"
    expect(weaponNames('unit-hero')).toContain('Hero Pod')
    expect(weaponNames('unit-squad')).not.toContain('Hero Pod')
  })

  it('reveals statically hidden options for matching units', () => {
    // hidden by default, but "set hidden=false when instanceOf Infantry"
    expect(weaponNames('unit-squad')).toContain('Squad Pod')
    expect(weaponNames('unit-hero')).not.toContain('Squad Pod')
  })

  it('keeps selection-gated options visible (unknown conditions)', () => {
    // revealed by an atLeast-selections condition we cannot evaluate:
    // prefer listing it as a possible loadout
    expect(weaponNames('unit-squad')).toContain('Unlockable Pod')
    expect(weaponNames('unit-hero')).toContain('Unlockable Pod')
  })

  it('drops statically hidden options with no reveal', () => {
    expect(weaponNames('unit-squad')).not.toContain('Never Pod')
    expect(weaponNames('unit-hero')).not.toContain('Never Pod')
  })
})
