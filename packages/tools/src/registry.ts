/**
 * Tool dispatch.
 *
 * The allowlist IS the registry: a name that is not a key here cannot be called, so a
 * model inventing `run_sql` gets a rejection rather than an attempt.
 */

import {
  isToolName,
  validateArguments,
  toolError,
  type ToolArguments,
  type ToolContext,
  type ToolName,
  type ToolResult,
} from './contracts.js';
import { makeHandlers, type UnitLoader } from './handlers.js';

export interface ToolRegistry {
  readonly names: readonly ToolName[];
  invoke(ctx: ToolContext, name: string, args: ToolArguments): Promise<ToolResult>;
}

export const createToolRegistry = (loadUnit: UnitLoader): ToolRegistry => {
  const handlers = makeHandlers(loadUnit);
  const names = Object.keys(handlers) as ToolName[];

  return {
    names,
    invoke: async (ctx, name, args) => {
      if (!isToolName(name)) {
        // Deliberately does not list the allowlist back: a rejection should not teach an
        // attacker the shape of what would be accepted.
        return toolError('unknown', `unknown tool: ${String(name).slice(0, 40)}`);
      }
      const validated = validateArguments(args);
      if (!validated.ok) return toolError(name, validated.error);
      const handler = handlers[name];
      try {
        return await handler(ctx, validated.args);
      } catch (error) {
        return toolError(name, error instanceof Error ? error.message : 'tool execution failed');
      }
    },
  };
};
