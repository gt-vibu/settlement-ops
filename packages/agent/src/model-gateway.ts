/**
 * Ollama model gateway.
 *
 * The ONLY place a model is called. Everything about it is bounded: the digest is pinned,
 * the output is schema-constrained, the request has a timeout, and a failure is a SAFE
 * FAILURE - never a silent resolution.
 *
 * `MODEL_POLICY.md` Part II: Ollama tags are mutable, so the digest is the identity. The
 * gateway asserts it before the first call, so a silently re-pulled model fails loudly
 * rather than quietly producing an incomparable benchmark.
 */

export interface ModelIdentity {
  readonly provider: string;
  readonly model: string;
  /**
   * Expected digest, or null to skip the assertion.
   *
   * Null is acceptable for a demo against a locally chosen model. It is NOT acceptable for
   * anything that produces a comparable number - the benchmark always supplies the frozen
   * digest, and refuses to run without a match.
   */
  readonly digest: string | null;
}

export type ModelFailure =
  | 'MODEL_UNAVAILABLE'
  | 'MODEL_TIMEOUT'
  | 'MODEL_ERROR'
  | 'MODEL_SCHEMA_VIOLATION'
  | 'MODEL_DIGEST_MISMATCH';

export type ModelResponse<T> =
  | { readonly ok: true; readonly value: T; readonly outputTokens: number }
  | { readonly ok: false; readonly failure: ModelFailure; readonly detail: string };

export interface ModelMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface GatewayOptions {
  readonly host: string;
  readonly identity: ModelIdentity;
  readonly temperature: number;
  readonly timeoutSeconds: number;
  readonly maxOutputTokens: number;
}

export interface ModelGateway {
  /** Confirms the pinned digest is what is actually installed. */
  assertPinnedModel(): Promise<{ ok: boolean; detail: string }>;
  chat<T>(
    messages: readonly ModelMessage[],
    schema: Readonly<Record<string, unknown>>,
  ): Promise<ModelResponse<T>>;
}

interface TagsResponse {
  models?: { name?: string; digest?: string }[];
}

export const createOllamaGateway = (options: GatewayOptions): ModelGateway => ({
  assertPinnedModel: async () => {
    try {
      const response = await fetch(`${options.host}/api/tags`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return { ok: false, detail: `ollama returned ${response.status}` };
      const body = (await response.json()) as TagsResponse;
      const found = (body.models ?? []).find((m) => m.name === options.identity.model);
      if (found === undefined) {
        return { ok: false, detail: `model ${options.identity.model} is not installed` };
      }
      if (options.identity.digest === null) {
        return { ok: true, detail: `model present; no digest pinned (not reproducible)` };
      }
      if (found.digest !== options.identity.digest) {
        return {
          ok: false,
          detail: `digest mismatch: pinned ${options.identity.digest.slice(0, 12)}, installed ${String(found.digest).slice(0, 12)}`,
        };
      }
      return { ok: true, detail: `pinned digest confirmed` };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : 'ollama unreachable' };
    }
  },

  chat: async <T>(
    messages: readonly ModelMessage[],
    schema: Readonly<Record<string, unknown>>,
  ): Promise<ModelResponse<T>> => {
    let response: Response;
    try {
      response = await fetch(`${options.host}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(options.timeoutSeconds * 1_000),
        body: JSON.stringify({
          model: options.identity.model,
          messages,
          stream: false,
          // Schema-constrained decoding: the model cannot emit a free-form decision.
          format: schema,
          think: false,
          options: {
            temperature: options.temperature,
            num_predict: options.maxOutputTokens,
          },
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const timedOut = message.includes('timed out') || message.includes('abort');
      return {
        ok: false,
        failure: timedOut ? 'MODEL_TIMEOUT' : 'MODEL_UNAVAILABLE',
        detail: message,
      };
    }

    if (!response.ok) {
      return { ok: false, failure: 'MODEL_ERROR', detail: `ollama returned ${response.status}` };
    }

    let content: string;
    let outputTokens = 0;
    try {
      const body = (await response.json()) as {
        message?: { content?: string };
        eval_count?: number;
      };
      content = body.message?.content ?? '';
      outputTokens = body.eval_count ?? 0;
    } catch (error) {
      return {
        ok: false,
        failure: 'MODEL_ERROR',
        detail: error instanceof Error ? error.message : 'unreadable response',
      };
    }

    try {
      return { ok: true, value: JSON.parse(content) as T, outputTokens };
    } catch {
      // Schema-constrained decoding should make this impossible; if it happens the answer
      // is unusable and the case escalates. It is never "close enough to parse loosely".
      return {
        ok: false,
        failure: 'MODEL_SCHEMA_VIOLATION',
        detail: content.slice(0, 200),
      };
    }
  },
});
