/**
 * The pinned model identity.
 *
 * `MODEL_POLICY.md` Part II: Ollama tags are MUTABLE - `qwen2.5:3b-instruct-q4_K_M` can
 * point at different weights next month. The digest is the identity; the tag is a
 * convenience. Every treatment run asserts the digest before it starts, so a silently
 * re-pulled model fails loudly instead of quietly producing an incomparable result.
 *
 * WHY THIS MODEL. Selected under a real hardware constraint, recorded rather than hidden:
 * the evaluation host is CPU-only (AMD integrated graphics, 15.4 GB RAM). Measured warm
 * throughput is ~14 tokens/s for this 3B q4_K_M build; a 7B q4 build runs at roughly a
 * third of that, which would put a 180-case scored run beyond the time available. The
 * model was chosen for reliable schema-constrained JSON at a throughput that lets the
 * whole benchmark actually run.
 *
 * This is a capability ceiling on the RESULT, not on the architecture, and it must be
 * reported as such: a stronger model would very likely score better, and the benchmark
 * says nothing about how a stronger model would behave.
 */

export interface ModelIdentity {
  readonly provider: 'ollama';
  readonly model: string;
  readonly digest: string;
  readonly parameterSize: string;
  readonly quantization: string;
}

export const PINNED_MODEL: ModelIdentity = {
  provider: 'ollama',
  model: 'qwen2.5:3b-instruct-q4_K_M',
  digest: '357c53fb659c5076de1d65ccb0b397446227b71a42be9d1603d46168015c9e4b',
  parameterSize: '3.1B',
  quantization: 'Q4_K_M',
};

export const OLLAMA_DEFAULT_HOST = 'http://127.0.0.1:11434';
