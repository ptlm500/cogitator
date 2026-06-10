import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { BsIndex, extractFaction } from './extract.ts'
import { fetchBsData, updatePin } from './fetch.ts'
import { parseBsXml, type BSDocument } from './parse.ts'
import type { DataIndex, FactionRef } from './types.ts'

const EDITION = '10e'
const OUT_DIR = path.join(import.meta.dirname, '..', 'public', 'data', EDITION)

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function main() {
  if (process.argv.includes('--update-pin')) {
    const pin = await updatePin()
    console.log(`Pinned ${pin.repo} @ ${pin.sha}`)
  }

  const { dir, pin } = await fetchBsData()
  const files = (await readdir(dir)).filter(
    (f) => f.endsWith('.cat') || f.endsWith('.gst'),
  )
  console.log(
    `Parsing ${files.length} files from ${pin.repo} @ ${pin.sha.slice(0, 7)}`,
  )

  const docs: BSDocument[] = []
  for (const file of files) {
    const xml = await readFile(path.join(dir, file), 'utf8')
    docs.push(parseBsXml(xml, file))
  }

  const index = new BsIndex(docs)
  if (!index.ptsCostTypeId)
    throw new Error('pts cost type not found in game system')

  await rm(OUT_DIR, { recursive: true, force: true })
  await mkdir(OUT_DIR, { recursive: true })

  const refs: FactionRef[] = []
  for (const doc of docs) {
    const faction = extractFaction(doc, index, pin.sha, EDITION)
    if (!faction) continue
    const slug = slugify(faction.name)
    const file = `${slug}.json`
    await writeFile(path.join(OUT_DIR, file), JSON.stringify(faction))
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
    edition: EDITION,
    source: pin.repo,
    sha: pin.sha,
    generatedAt: new Date().toISOString(),
    factions: refs,
  }
  await writeFile(
    path.join(OUT_DIR, 'index.json'),
    JSON.stringify(dataIndex, null, 2),
  )

  const totalUnits = refs.reduce((sum, r) => sum + r.unitCount, 0)
  console.log(
    `Wrote ${refs.length} factions, ${totalUnits} units to ${OUT_DIR}`,
  )
}

await main()
