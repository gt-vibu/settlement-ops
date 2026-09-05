/**
 * Runtime model configuration.
 *
 * WHY THIS FILE EXISTS. The API used to read the model identity and the agent budget from
 * `@settlementops/evaluation`, which is the package that owns `eval-store.ts` - the only
 * module in the repository capable of opening the hidden-truth database. That linked
 * evaluation code into the API process for the sake of three constants.
 *
 * It was not exploitable: application config refuses to start when the evaluation
 * credential is present, and the application role has no CONNECT privilege on
 * `settlementops_eval`. But it is exactly
 * the coupling `scripts/check-deps.ts` exists to forbid, and defence in depth means the
 * capability should not be linked in at all.
 *
 * The runtime now owns its own model configuration, read from the environment and
 * validated at startup. The frozen experiment keeps its own immutable copy of the values
 * it ran with; `frozen-budget.test.ts` asserts the two agree, so drift is visible without
 * either depending on the other.
 */

export interface ModelRuntimeConfig {
  readonly host: string;
  readonly model: string;
  /**
   * Expected digest, or null to skip the assertion.
   *
   * Null is permitted for a demo against a locally chosen model. It is NOT permitted for
   * anything that produces a comparable number: `pnpm eval:run` supplies the frozen digest
   * and refuses to proceed on a mismatch.
   */
  readonly digest: string | null;
  readonly temperature: number;
  readonly requestTimeoutSeconds: number;
  readonly maxOutputTokens: number;
  readonly maxRetries: number;
}

export interface AgentBudgetConfig {
  readonly maxToolCalls: number;
  readonly maxSteps: number;
  readonly maxWallclockSeconds: number;
  readonly identicalToolCallLimit: number;
}

/**
 * The budget the frozen experiment ran with (`EXPERIMENT_CONSTANTS.md` §5).
 *
 * Duplicated deliberately rather than imported from the evaluation package - see the file
 * comment. A test pins the two together.
 */
export const DEFAULT_AGENT_BUDGET: AgentBudgetConfig = {
  maxToolCalls: 8,
  maxSteps: 8,
  maxWallclockSeconds: 120,
  identicalToolCallLimit: 1,
};

export const DEFAULT_OLLAMA_HOST = 'http://127.0.0.1:11434';

export class ModelConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelConfigurationError';
  }
}

const positiveInt = (raw: string | undefined, fallback: number, name: string): number => {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new ModelConfigurationError(`${name} must be a positive integer, received "${raw}"`);
  }
  return value;
};

/**
 * Read and validate model configuration.
 *
 * Fails fast: a process that is going to call a model should discover a bad host or an
 * unparseable timeout at startup, not on the first investigation.
 */
export const loadModelConfig = (env: NodeJS.ProcessEnv = process.env): ModelRuntimeConfig => {
  const host = env['OLLAMA_HOST']?.trim() ?? DEFAULT_OLLAMA_HOST;
  if (!/^https?:\/\//.test(host)) {
    throw new ModelConfigurationError(`OLLAMA_HOST must be an http(s) URL, received "${host}"`);
  }

  const model = env['OLLAMA_MODEL']?.trim() ?? '';
  if (model === '') {
    throw new ModelConfigurationError(
      'OLLAMA_MODEL is required when AI investigation is enabled. There is no default: a ' +
        'silently chosen model would produce results nobody could reproduce.',
    );
  }

  const digest = env['OLLAMA_MODEL_DIGEST']?.trim();
  if (digest !== undefined && digest !== '' && !/^[0-9a-f]{64}$/.test(digest)) {
    throw new ModelConfigurationError('OLLAMA_MODEL_DIGEST must be 64 lowercase hex characters');
  }

  const temperatureRaw = env['MODEL_TEMPERATURE']?.trim();
  const temperature =
    temperatureRaw === undefined || temperatureRaw === '' ? 0 : Number(temperatureRaw);
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    throw new ModelConfigurationError('MODEL_TEMPERATURE must be between 0 and 2');
  }

  return {
    host,
    model,
    digest: digest === undefined || digest === '' ? null : digest,
    temperature,
    requestTimeoutSeconds: positiveInt(env['MODEL_TIMEOUT_SECONDS'], 60, 'MODEL_TIMEOUT_SECONDS'),
    maxOutputTokens: positiveInt(env['MODEL_MAX_OUTPUT_TOKENS'], 512, 'MODEL_MAX_OUTPUT_TOKENS'),
    maxRetries: positiveInt(env['MODEL_MAX_RETRIES'], 2, 'MODEL_MAX_RETRIES'),
  };
};

export const loadAgentBudget = (env: NodeJS.ProcessEnv = process.env): AgentBudgetConfig => ({
  maxToolCalls: positiveInt(
    env['AGENT_MAX_TOOL_CALLS'],
    DEFAULT_AGENT_BUDGET.maxToolCalls,
    'AGENT_MAX_TOOL_CALLS',
  ),
  maxSteps: positiveInt(env['AGENT_MAX_STEPS'], DEFAULT_AGENT_BUDGET.maxSteps, 'AGENT_MAX_STEPS'),
  maxWallclockSeconds: positiveInt(
    env['AGENT_MAX_WALLCLOCK_SECONDS'],
    DEFAULT_AGENT_BUDGET.maxWallclockSeconds,
    'AGENT_MAX_WALLCLOCK_SECONDS',
  ),
  identicalToolCallLimit: DEFAULT_AGENT_BUDGET.identicalToolCallLimit,
});
