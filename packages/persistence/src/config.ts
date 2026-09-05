/**
 * Runtime configuration, schema-validated at startup (specs/CONFIGURATION.md).
 *
 * The process fails fast rather than starting in a misconfigured state. Three of the
 * assertions below are security controls, not conveniences:
 *
 *   1. the demo auth adapter must never run in production (D3);
 *   2. the application must never be able to load the evaluation credential (D5);
 *   3. demo scenario routes must never be enabled in production.
 */

import { z } from 'zod';

/**
 * Environment booleans.
 *
 * NOT `z.coerce.boolean()`. That applies JavaScript truthiness, so the string "false"
 * coerces to `true` - which would make AI_INVESTIGATION_ENABLED=false silently leave the
 * kill switch ON. An operator who disables a safety flag must actually disable it, so
 * this parses the text and rejects anything ambiguous rather than guessing.
 */
const envBoolean = z.union([z.boolean(), z.string()]).transform((value, ctx) => {
  if (typeof value === 'boolean') return value;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: `expected a boolean, received "${value}"`,
  });
  return z.NEVER;
});

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'demo', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  AUTH_ADAPTER: z.enum(['demo', 'oidc']).default('demo'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  AI_INVESTIGATION_ENABLED: envBoolean.default(false),
  DEMO_SCENARIOS_ENABLED: envBoolean.default(false),
});

export type AppConfig = z.infer<typeof schema>;

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Decision D5: the evaluation credential must be unreachable from the application
 * runtime. Its mere presence in the environment is a misconfiguration, because it
 * means the process could open a connection to hidden ground truth.
 */
const assertNoEvaluationCredential = (env: NodeJS.ProcessEnv): void => {
  if (env.EVAL_DATABASE_URL !== undefined) {
    throw new ConfigurationError(
      'EVAL_DATABASE_URL is present in the application environment. ' +
        'Hidden evaluation truth must be unreachable from apps/api and apps/worker (D5).',
    );
  }
};

const assertProductionSafety = (config: AppConfig): void => {
  if (config.NODE_ENV !== 'production') return;
  if (config.AUTH_ADAPTER === 'demo') {
    throw new ConfigurationError('The demo authentication adapter cannot run in production (D3).');
  }
  if (config.DEMO_SCENARIOS_ENABLED) {
    throw new ConfigurationError('Demo scenario routes cannot be enabled in production.');
  }
};

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
  assertNoEvaluationCredential(env);
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigurationError(
      `Invalid configuration: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  assertProductionSafety(parsed.data);
  return parsed.data;
};
