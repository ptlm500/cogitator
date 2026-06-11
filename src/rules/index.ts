import { engine10e } from './10e/engine.ts'
import { engine11e } from './11e/engine.ts'
import type { RulesEngine } from './types.ts'

export const engines: Record<string, RulesEngine> = {
  '10e': engine10e,
  '11e': engine11e,
}

export type * from './types.ts'
