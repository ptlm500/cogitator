import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isParseableDice } from '../src/rules/lib/dice.ts'
import type { DataIndex, FactionFile, FactionRef } from '../src/data/types.ts'
import { BsIndex, extractFaction } from './extract.ts'
import { fetchBsData, readPins, updatePins, type EditionPin } from './fetch.ts'
import { parseBsXml, type BSDocument } from './parse.ts'

const OUT_ROOT = path.join(import.meta.dirname, '..', 'public', 'data')

// floors that a refreshed dataset must clear before it replaces the old one
const VALIDATION: Record<string, { factions: number; units: number }> = {
  '10e': { factions: 25, units: 1200 },
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function validate(edition: string, factions: FactionFile[]): void {
  const floor = VALIDATION[edition] ?? { factions: 1, units: 50 }
  const units = factions.reduce((sum, f) => sum + f.units.length, 0)
  if (factions.length < floor.factions || units < floor.units) {
    throw new Error(
      `${edition}: extracted ${factions.length} factions / ${units} units, ` +
        `expected at least ${floor.factions} / ${floor.units} — refusing to write`,
    )
  }
  const bad: string[] = []
  for (const faction of factions) {
    for (const unit of faction.units) {
      for (const weapon of Object.values(unit.weapons)) {
        for (const profile of weapon.profiles) {
          if (!isParseableDice(profile.attacks)) {
            bad.push(`${unit.name} / ${profile.name}: A="${profile.attacks}"`)
          }
          if (!isParseableDice(profile.damage)) {
            bad.push(`${unit.name} / ${profile.name}: D="${profile.damage}"`)
          }
        }
      }
    }
  }
  if (bad.length > 0) {
    throw new Error(
      `${edition}: ${bad.length} unparseable weapon characteristics, e.g.\n` +
        bad.slice(0, 10).join('\n'),
    )
  }
}

async function buildEdition(
  edition: string,
  pin: EditionPin,
): Promise<{ factions: number; units: number }> {
  const dir = await fetchBsData(pin)
  const files = (await readdir(dir)).filter(
    (f) => f.endsWith('.cat') || f.endsWith('.gst'),
  )
  console.log(
    `[${edition}] parsing ${files.length} files from ${pin.repo} @ ${pin.sha!.slice(0, 7)}`,
  )

  const docs: BSDocument[] = []
  for (const file of files) {
    const xml = await readFile(path.join(dir, file), 'utf8')
    docs.push(parseBsXml(xml, file))
  }
  const index = new BsIndex(docs)
  if (!index.ptsCostTypeId) {
    throw new Error(`[${edition}] pts cost type not found in game system`)
  }

  const factions = docs
    .map((doc) => extractFaction(doc, index, pin.sha!, edition))
    .filter((f): f is FactionFile => f !== null)
  validate(edition, factions)

  const outDir = path.join(OUT_ROOT, edition)
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  const refs: FactionRef[] = []
  for (const faction of factions) {
    const slug = slugify(faction.name)
    const file = `${slug}.json`
    await writeFile(path.join(outDir, file), JSON.stringify(faction))
    refs.push({
      id: faction.id,
      slug,
      name: faction.name,
      file,
      unitCount: faction.units.length,
    })
  }
  refs.sort((a, b) => a.name.localeCompare(b.name))

  const dataIndex: DataIndex = {
    schema: 1,
    edition,
    source: pin.repo!,
    sha: pin.sha!,
    generatedAt: new Date().toISOString(),
    factions: refs,
  }
  await writeFile(
    path.join(outDir, 'index.json'),
    JSON.stringify(dataIndex, null, 2),
  )
  return {
    factions: refs.length,
    units: refs.reduce((sum, r) => sum + r.unitCount, 0),
  }
}

async function main() {
  const editions = process.argv.includes('--update-pin')
    ? await updatePins()
    : await readPins()

  for (const [edition, pin] of Object.entries(editions)) {
    if (pin.dataFrom) {
      if (!editions[pin.dataFrom] || editions[pin.dataFrom].dataFrom) {
        throw new Error(`[${edition}] dataFrom points to unknown edition`)
      }
      console.log(`[${edition}] aliased to ${pin.dataFrom} data`)
      continue
    }
    const { factions, units } = await buildEdition(edition, pin)
    console.log(`[${edition}] wrote ${factions} factions, ${units} units`)
  }

  await writeFile(
    path.join(OUT_ROOT, 'editions.json'),
    JSON.stringify(
      Object.entries(editions).map(([edition, pin]) => ({
        edition,
        label: pin.label,
        ...(pin.dataFrom ? { data: pin.dataFrom } : {}),
      })),
      null,
      2,
    ),
  )
}

await main()
