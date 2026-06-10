import { engine10e } from './10e/engine.ts'
import type { RulesEngine } from './types.ts'

export const engines: Record<string, RulesEngine> = {
  '10e': engine10e,
}

export type * from './types.ts'
