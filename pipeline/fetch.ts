import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const PIPELINE_DIR = import.meta.dirname
const CACHE_DIR = path.join(PIPELINE_DIR, '.cache')
const PIN_FILE = path.join(PIPELINE_DIR, 'bsdata-pin.json')

interface Pin {
  repo: string
  sha: string
}

export async function readPin(): Promise<Pin> {
  return JSON.parse(await readFile(PIN_FILE, 'utf8')) as Pin
}

/** Update the pin to the BSData repo's current main HEAD */
export async function updatePin(): Promise<Pin> {
  const { repo } = await readPin()
  const res = await fetch(`https://api.github.com/repos/${repo}/commits/main`, {
    headers: { accept: 'application/vnd.github+json' },
  })
  if (!res.ok) throw new Error(`GitHub API: ${res.status} ${res.statusText}`)
  const { sha } = (await res.json()) as { sha: string }
  const pin = { repo, sha }
  await writeFile(PIN_FILE, JSON.stringify(pin, null, 2) + '\n')
  return pin
}

/**
 * Ensure the pinned BSData snapshot is on disk; returns the directory
 * containing the .gst and .cat files.
 */
export async function fetchBsData(): Promise<{ dir: string; pin: Pin }> {
  const pin = await readPin()
  const dir = path.join(CACHE_DIR, pin.sha)
  if (existsSync(dir)) return { dir, pin }

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
  return { dir, pin }
}
