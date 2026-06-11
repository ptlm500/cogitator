// End-to-end browser smoke test. Requires the dev server on :5173
// (pnpm dev) and Google Chrome installed. Run: node scripts/smoke.mjs
import { chromium } from 'playwright-core'

const BASE = process.env.SMOKE_URL ?? 'http://localhost:5173'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors = []

async function newPage(viewport) {
  const page = await browser.newPage({ viewport })
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))
  return page
}

const page = await newPage({ width: 1280, height: 1200 })
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.getByText('COGITATOR', { exact: false }).first().waitFor()
console.log('page loaded')

const factionTriggers = page.getByLabel('Faction')
const unitTriggers = page.getByLabel('Unit')
await factionTriggers.nth(0).click()
await page
  .getByRole('option', { name: 'Imperium - Adeptus Astartes - Space Marines' })
  .click()
await unitTriggers.nth(0).click()
await page
  .getByRole('option', { name: 'Intercessor Squad', exact: true })
  .click()
await factionTriggers.nth(1).click()
await page.getByRole('option', { name: 'Chaos - Death Guard' }).click()
await unitTriggers.nth(1).click()
await page.getByRole('option', { name: 'Plague Marines', exact: true }).click()
console.log('units selected')

await page.getByText('Probability', { exact: false }).waitFor({ timeout: 5000 })
const stat = (p, label) =>
  p
    .locator('dt', { hasText: label })
    .locator('xpath=following-sibling::dd[1]')
    .first()
    .textContent()
const baseline = await stat(page, 'Hits')

// +1 to hit must increase expected hits
await page
  .getByRole('group', { name: 'Hit roll' })
  .getByRole('button', { name: '+1' })
  .click()
await page.waitForTimeout(200)
const buffed = await stat(page, 'Hits')
if (Number(buffed) <= Number(baseline)) {
  throw new Error(`+1 to hit did not increase hits: ${baseline} -> ${buffed}`)
}
console.log(`modifier works: hits ${baseline} -> ${buffed}`)

// FNP override must reduce damage
const dmgBefore = await stat(page, 'Damage')
await page
  .getByRole('group', { name: 'Feel No Pain' })
  .getByRole('button', { name: '5+', exact: true })
  .click()
await page.waitForTimeout(200)
const dmgAfter = await stat(page, 'Damage')
if (Number(dmgAfter) >= Number(dmgBefore)) {
  throw new Error(
    `FNP override did not reduce damage: ${dmgBefore} -> ${dmgAfter}`,
  )
}
console.log(`override works: damage ${dmgBefore} -> ${dmgAfter}`)

// defender stat tuning: dropping T6 -> T4 makes S4 wound on 4s
const wTuneBefore = await stat(page, 'Wounds')
await page.getByLabel('Modify Plague Marine', { exact: true }).click()
await page.getByLabel('Decrease Plague Marine toughness').click()
await page.getByLabel('Decrease Plague Marine toughness').click()
await page.waitForTimeout(200)
const wTuneAfter = await stat(page, 'Wounds')
if (Number(wTuneAfter) <= Number(wTuneBefore)) {
  throw new Error(
    `defender toughness tune had no effect: ${wTuneBefore} -> ${wTuneAfter}`,
  )
}
await page.getByLabel('Increase Plague Marine toughness').click()
await page.getByLabel('Increase Plague Marine toughness').click()
await page.getByLabel('Modify Plague Marine', { exact: true }).click()
console.log(`defender tune works: wounds ${wTuneBefore} -> ${wTuneAfter}`)

// attaching a character to the attacker adds its weapons
const attacksBefore = await stat(page, 'Attacks')
await page.getByLabel('Attached character').nth(0).click()
await page.getByRole('option', { name: 'Apothecary', exact: true }).click()
await page.waitForTimeout(200)
const attacksAfter = await stat(page, 'Attacks')
if (Number(attacksAfter) <= Number(attacksBefore)) {
  throw new Error(
    `attacker character added no attacks: ${attacksBefore} -> ${attacksAfter}`,
  )
}
console.log(
  `attacker character works: attacks ${attacksBefore} -> ${attacksAfter}`,
)

// attaching a character to the defender reports its survival
await page.getByLabel('Attached character').nth(1).click()
await page.getByRole('option', { name: 'Typhus', exact: true }).click()
await page
  .getByText('Typhus slain', { exact: false })
  .waitFor({ timeout: 3000 })
console.log('defender character works')

// per-profile tuning lives in the expandable editor
await page.getByLabel('Modify Bolt Rifle', { exact: true }).click()

// +1 attack on the rifles adds one attack per weapon
const atkBefore = await stat(page, 'Attacks')
await page.getByLabel('Increase Bolt Rifle attacks bonus').click()
await page.waitForTimeout(200)
const atkAfter = await stat(page, 'Attacks')
if (Number(atkAfter) !== Number(atkBefore) + 5) {
  throw new Error(`attack bonus wrong: ${atkBefore} -> ${atkAfter}`)
}
await page.getByLabel('Decrease Bolt Rifle attacks bonus').click()
console.log(`attack bonus works: attacks ${atkBefore} -> ${atkAfter}`)

// strength, AP and damage tweaks all move the numbers
const wBefore = await stat(page, 'Wounds')
// S4 -> S6 vs the Plague Marines' T6: wound roll improves from 5+ to 4+
await page.getByLabel('Increase Bolt Rifle strength').click()
await page.getByLabel('Increase Bolt Rifle strength').click()
await page.waitForTimeout(200)
const wAfter = await stat(page, 'Wounds')
if (Number(wAfter) <= Number(wBefore)) {
  throw new Error(`strength tweak had no effect: ${wBefore} -> ${wAfter}`)
}
await page.getByLabel('Decrease Bolt Rifle strength').click()
await page.getByLabel('Decrease Bolt Rifle strength').click()
const uBefore = await stat(page, 'Unsaved')
await page.getByLabel('Increase Bolt Rifle AP').click()
await page.waitForTimeout(200)
const uAfter = await stat(page, 'Unsaved')
if (Number(uAfter) <= Number(uBefore)) {
  throw new Error(`AP tweak had no effect: ${uBefore} -> ${uAfter}`)
}
await page.getByLabel('Decrease Bolt Rifle AP').click()
const dBefore = await stat(page, 'Damage')
await page.getByLabel('Increase Bolt Rifle damage bonus').click()
await page.waitForTimeout(200)
const dAfter = await stat(page, 'Damage')
if (Number(dAfter) <= Number(dBefore)) {
  throw new Error(`damage tweak had no effect: ${dBefore} -> ${dAfter}`)
}
await page.getByLabel('Decrease Bolt Rifle damage bonus').click()
console.log(
  `stat tweaks work: S ${wBefore}->${wAfter} AP ${uBefore}->${uAfter} D ${dBefore}->${dAfter}`,
)

// granting Lethal Hits raises expected wounds
const woundsBefore = await stat(page, 'Wounds')
await page.getByRole('button', { name: 'Lethal Hits', exact: true }).click()
await page.waitForTimeout(200)
const woundsAfter = await stat(page, 'Wounds')
if (Number(woundsAfter) <= Number(woundsBefore)) {
  throw new Error(
    `lethal hits grant had no effect: ${woundsBefore} -> ${woundsAfter}`,
  )
}
console.log(`granted ability works: wounds ${woundsBefore} -> ${woundsAfter}`)

// worsening a profile's BS stacks with the +1 hit modifier
const hitsBeforeSkill = await stat(page, 'Hits')
await page.getByLabel('Increase Bolt Rifle skill').click()
await page.waitForTimeout(200)
const hitsAfterSkill = await stat(page, 'Hits')
if (Number(hitsAfterSkill) >= Number(hitsBeforeSkill)) {
  throw new Error(
    `BS override did not change hits: ${hitsBeforeSkill} -> ${hitsAfterSkill}`,
  )
}
console.log(
  `skill override works: hits ${hitsBeforeSkill} -> ${hitsAfterSkill}`,
)
await page.getByLabel('Modify Bolt Rifle', { exact: true }).click()
const buffedFinal = hitsAfterSkill

// the URL must restore the whole state in a fresh page
const shareUrl = page.url()
if (!shareUrl.includes('#')) throw new Error('URL has no state hash')
const fresh = await newPage({ width: 1280, height: 1200 })
await fresh.goto(shareUrl, { waitUntil: 'domcontentloaded' })
await fresh.getByText('Intercessor Squad').first().waitFor({ timeout: 5000 })
await fresh.getByText('Plague Marines').first().waitFor()
await fresh.getByText('Probability', { exact: false }).waitFor()
const restoredHits = await stat(fresh, 'Hits')
if (restoredHits !== buffedFinal) {
  throw new Error(
    `URL restore mismatch: hits ${restoredHits} != ${buffedFinal}`,
  )
}
console.log('URL restore works')
await page.screenshot({ path: '/tmp/cogitator-smoke.png', fullPage: true })

// mixed-statline defenders render one count row per defense group
await fresh.getByLabel('Faction').nth(1).click()
await fresh
  .getByRole('option', { name: 'Chaos - Chaos Daemons', exact: true })
  .click()
await fresh.getByLabel('Unit').nth(1).click()
await fresh
  .getByRole('option', { name: 'Accursed Cultists', exact: true })
  .click()
await fresh.getByText('Torment', { exact: true }).waitFor({ timeout: 5000 })
await fresh.getByText('Mutant', { exact: true }).waitFor()
const mixedSlain = await stat(fresh, 'Slain')
// removing the tougher W3 Torments leaves only W1 Mutants: more models die
const decTorment = fresh.getByLabel('Decrease Torment models')
while (await decTorment.isEnabled()) await decTorment.click()
await fresh.waitForTimeout(200)
const mixedSlain2 = await stat(fresh, 'Slain')
if (Number(mixedSlain2) <= Number(mixedSlain)) {
  throw new Error(
    `removing W3 group did not raise slain: ${mixedSlain} -> ${mixedSlain2}`,
  )
}
console.log(`mixed statlines work: slain ${mixedSlain} -> ${mixedSlain2}`)

// --- 11th edition (preview on 10e data) ---
const hits10e = await stat(fresh, 'Hits')
await fresh.getByLabel('Edition').click()
await fresh.getByRole('option', { name: '11th Ed (Preview)' }).click()
await fresh
  .getByText('Probability', { exact: false })
  .waitFor({ timeout: 5000 })
// uniform defender: hit math is unchanged between editions
const hits11e = await stat(fresh, 'Hits')
if (hits10e !== hits11e) {
  throw new Error(`uniform-defender hits differ: ${hits10e} vs ${hits11e}`)
}
// 11e-only toggles appear
await fresh.getByRole('button', { name: 'Indirect fire' }).waitFor()
// cover is now a BS penalty: toggling it must reduce hits
await fresh.getByRole('button', { name: 'Target in cover' }).click()
await fresh.waitForTimeout(200)
const hitsCover = await stat(fresh, 'Hits')
if (Number(hitsCover) >= Number(hits11e)) {
  throw new Error(`11e cover did not reduce hits: ${hits11e} -> ${hitsCover}`)
}
await fresh.getByRole('button', { name: 'Target in cover' }).click()
console.log(`11e cover works: hits ${hits11e} -> ${hitsCover}`)

// defense-group reordering changes allocation results
await fresh.getByLabel('Increase Torment models').click()
await fresh.waitForTimeout(200)
const beforeReorder = await stat(fresh, 'Damage')
await fresh.getByLabel('Move Mutant earlier').click()
await fresh.waitForTimeout(200)
const afterReorder = await stat(fresh, 'Damage')
if (beforeReorder === afterReorder) {
  throw new Error('group reorder had no effect on results')
}
console.log(
  `11e group reorder works: damage ${beforeReorder} -> ${afterReorder}`,
)
await fresh.screenshot({ path: '/tmp/cogitator-11e.png', fullPage: true })

// mobile viewport render check
const mobile = await newPage({ width: 375, height: 800 })
await mobile.goto(shareUrl, { waitUntil: 'domcontentloaded' })
await mobile
  .getByText('Probability', { exact: false })
  .waitFor({ timeout: 5000 })
await mobile.screenshot({ path: '/tmp/cogitator-mobile.png', fullPage: true })
const overflow = await mobile.evaluate(
  () =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
)
if (overflow > 0) {
  throw new Error(`mobile horizontal overflow: ${overflow}px`)
}
console.log('mobile rendered without horizontal scroll')

console.log('console errors:', errors.length ? errors : 'none')
await browser.close()
if (errors.length > 0) process.exit(1)
