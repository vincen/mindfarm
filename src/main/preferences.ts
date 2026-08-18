import { app } from 'electron'
import { readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { ThemePreference } from '@shared/types'

export interface WindowBounds {
  width: number
  height: number
  x?: number
  y?: number
}

export interface Preferences {
  theme: ThemePreference
  inspectorOpen: boolean
  windowBounds: WindowBounds
}

const DEFAULTS: Preferences = {
  theme: 'system',
  // Open on first run so the panel is discoverable; hiding it sticks.
  inspectorOpen: true,
  windowBounds: { width: 1180, height: 780 },
}

let cache: Preferences | null = null
let flushTimer: NodeJS.Timeout | null = null

function file(): string {
  return join(app.getPath('userData'), 'preferences.json')
}

function read(): Preferences {
  try {
    const parsed = JSON.parse(readFileSync(file(), 'utf8')) as Partial<Preferences>
    return {
      theme: parsed.theme ?? DEFAULTS.theme,
      inspectorOpen: parsed.inspectorOpen ?? DEFAULTS.inspectorOpen,
      windowBounds: { ...DEFAULTS.windowBounds, ...parsed.windowBounds },
    }
  } catch {
    return { ...DEFAULTS, windowBounds: { ...DEFAULTS.windowBounds } }
  }
}

export function getPreferences(): Preferences {
  cache ??= read()
  return cache
}

function flush(): void {
  if (!cache) return
  const target = file()
  const tmp = `${target}.${process.pid}.tmp`
  try {
    writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf8')
    renameSync(tmp, target)
  } catch {
    try {
      unlinkSync(tmp)
    } catch {
      /* nothing left to clean up */
    }
  }
}

/**
 * Window bounds change constantly, so writes are debounced. Deliberate choices such as
 * the appearance setting pass `immediate` to survive a force quit.
 */
export function setPreferences(patch: Partial<Preferences>, immediate = false): Preferences {
  cache = { ...getPreferences(), ...patch }
  if (flushTimer) clearTimeout(flushTimer)
  if (immediate) {
    flushTimer = null
    flush()
  } else {
    flushTimer = setTimeout(flush, 400)
  }
  return cache
}

export function flushPreferences(): void {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  flush()
}
