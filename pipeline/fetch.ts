import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const PIPELINE_DIR = import.meta.dirname
const CACHE_DIR = path.join(PIPELINE_DIR, '.cache')
const PIN_FILE = path.join(PIPELINE_DIR, 'bsdata-pin.json')

export interface EditionPin {
  label: string
  repo: string
  sha: string
}

interface PinFile {
  editions: Record<string, EditionPin>
}

export async function readPins(): Promise<Record<string, EditionPin>> {
  const file = JSON.parse(await readFile(PIN_FILE, 'utf8')) as PinFile
  return file.editions
}

/** Re-pin every edition to its BSData repo's current main HEAD */
export async function updatePins(): Promise<Record<string, EditionPin>> {
  const editions = await readPins()
  for (const [edition, pin] of Object.entries(editions)) {
    const res = await fetch(
      `https://api.github.com/repos/${pin.repo}/commits/main`,
      { headers: { accept: 'application/vnd.github+json' } },
    )
    if (!res.ok) {
      throw new Error(
        `GitHub API (${pin.repo}): ${res.status} ${res.statusText}`,
      )
    }
    const { sha } = (await res.json()) as { sha: string }
    editions[edition] = { ...pin, sha }
  }
  await writeFile(PIN_FILE, JSON.stringify({ editions }, null, 2) + '\n')
  return editions
}

/**
 * Ensure an edition's pinned BSData snapshot is on disk; returns the
 * directory containing the .gst and .cat files.
 */
export async function fetchBsData(pin: EditionPin): Promise<string> {
  const dir = path.join(CACHE_DIR, pin.sha)
  if (existsSync(dir)) return dir

  const url = `https://codeload.github.com/${pin.repo}/tar.gz/${pin.sha}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`)
  await mkdir(CACHE_DIR, { recursive: true })
  const tarball = path.join(CACHE_DIR, `${pin.sha}.tar.gz`)
  await writeFile(tarball, Buffer.from(await res.arrayBuffer()))

  const extractDir = path.join(CACHE_DIR, `${pin.sha}.extract`)
  await rm(extractDir, { recursive: true, force: true })
  await mkdir(extractDir, { recursive: true })
  await execFileAsync('tar', [
    '-xzf',
    tarball,
    '-C',
    extractDir,
    '--strip-components=1',
  ])
  await rename(extractDir, dir)
  await rm(tarball, { force: true })
  return dir
}
