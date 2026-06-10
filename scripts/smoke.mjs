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
  .getByRole('group', { name: 'Defender FNP' })
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

// mobile viewport render check
const mobile = await newPage({ width: 375, height: 800 })
await mobile.goto(shareUrl, { waitUntil: 'domcontentloaded' })
await mobile
  .getByText('Probability', { exact: false })
  .waitFor({ timeout: 5000 })
await mobile.screenshot({ path: '/tmp/cogitator-mobile.png', fullPage: true })
console.log('mobile rendered')

console.log('console errors:', errors.length ? errors : 'none')
await browser.close()
if (errors.length > 0) process.exit(1)
