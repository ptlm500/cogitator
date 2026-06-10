import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } })
const errors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})
page.on('pageerror', (err) => errors.push(String(err)))

await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' })
await page.getByText('COGITATOR', { exact: false }).first().waitFor()
console.log('page loaded')

// attacker: Space Marines / Intercessor Squad
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
console.log('attacker selected')

// defender: Death Guard / Plague Marines
await factionTriggers.nth(1).click()
await page.getByRole('option', { name: 'Chaos - Death Guard' }).click()
await unitTriggers.nth(1).click()
await page.getByRole('option', { name: 'Plague Marines', exact: true }).click()
console.log('defender selected')

await page.getByText('Probability', { exact: false }).waitFor({ timeout: 5000 })
const stats = {}
for (const label of [
  'Attacks',
  'Hits',
  'Wounds',
  'Unsaved',
  'Damage',
  'Slain',
]) {
  const dd = page
    .locator('dt', { hasText: label })
    .locator('xpath=following-sibling::dd[1]')
  stats[label] = await dd.first().textContent()
}
console.log('results:', JSON.stringify(stats))

// toggle melee and confirm results update
await page.getByRole('tab', { name: 'Melee' }).click()
await page.waitForTimeout(300)
const meleeAttacks = await page
  .locator('dt', { hasText: 'Attacks' })
  .locator('xpath=following-sibling::dd[1]')
  .first()
  .textContent()
console.log('melee attacks:', meleeAttacks)

await page.screenshot({ path: '/tmp/cogitator-smoke.png', fullPage: true })
console.log('console errors:', errors.length ? errors : 'none')
await browser.close()
