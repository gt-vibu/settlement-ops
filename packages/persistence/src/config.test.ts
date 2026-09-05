import { describe, it, expect } from 'vitest';
import { ConfigurationError, loadConfig } from './config.js';

const base = {
  DATABASE_URL: 'postgres://app:pw@localhost:5433/settlementops_app',
} as NodeJS.ProcessEnv;

describe('configuration', () => {
  it('loads a valid development configuration', () => {
    const config = loadConfig({ ...base, NODE_ENV: 'development' });
    expect(config.AUTH_ADAPTER).toBe('demo');
    expect(config.API_PORT).toBe(3000);
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => loadConfig({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toThrow(
      ConfigurationError,
    );
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'staging' })).toThrow(ConfigurationError);
  });
});

/**
 * Decision D5. The application runtime must not merely avoid reading hidden truth -
 * it must be unable to reach it. Presence of the credential is itself the failure.
 */
describe('hidden-truth isolation (D5)', () => {
  it('refuses to start if EVAL_DATABASE_URL is present in the environment', () => {
    expect(() =>
      loadConfig({
        ...base,
        NODE_ENV: 'development',
        EVAL_DATABASE_URL: 'postgres://eval@localhost/settlementops_eval',
      }),
    ).toThrow(/EVAL_DATABASE_URL/);
  });

  it('refuses even when the value is empty, because presence is the signal', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'development', EVAL_DATABASE_URL: '' })).toThrow(
      ConfigurationError,
    );
  });
});

/** Decision D3: the demo adapter is a development convenience, never a production path. */
describe('production safety assertions (D3)', () => {
  it('refuses to run the demo auth adapter in production', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', AUTH_ADAPTER: 'demo' })).toThrow(
      /demo authentication adapter/,
    );
  });

  it('allows a real adapter in production', () => {
    const config = loadConfig({ ...base, NODE_ENV: 'production', AUTH_ADAPTER: 'oidc' });
    expect(config.NODE_ENV).toBe('production');
  });

  it('refuses to enable demo scenario routes in production', () => {
    expect(() =>
      loadConfig({
        ...base,
        NODE_ENV: 'production',
        AUTH_ADAPTER: 'oidc',
        DEMO_SCENARIOS_ENABLED: 'true',
      }),
    ).toThrow(/Demo scenario routes/);
  });
});

/**
 * Regression: `z.coerce.boolean()` treats the STRING "false" as true, because
 * Boolean("false") is truthy. That silently left the AI kill switch on when an operator
 * had explicitly disabled it. Found by running the live API, not by a unit test.
 */
describe('environment boolean parsing (regression)', () => {
  const base = {
    DATABASE_URL: 'postgres://app:pw@localhost:5434/settlementops_app',
    NODE_ENV: 'development',
  } as NodeJS.ProcessEnv;

  it('treats the string "false" as FALSE, not as a truthy string', () => {
    const config = loadConfig({ ...base, AI_INVESTIGATION_ENABLED: 'false' });
    expect(config.AI_INVESTIGATION_ENABLED).toBe(false);
  });

  it.each(['true', '1', 'yes', 'on'])('accepts %s as true', (value) => {
    expect(loadConfig({ ...base, AI_INVESTIGATION_ENABLED: value }).AI_INVESTIGATION_ENABLED).toBe(
      true,
    );
  });

  it.each(['false', '0', 'no', 'off', ''])('accepts %s as false', (value) => {
    expect(loadConfig({ ...base, AI_INVESTIGATION_ENABLED: value }).AI_INVESTIGATION_ENABLED).toBe(
      false,
    );
  });

  it('rejects an ambiguous value rather than guessing', () => {
    expect(() => loadConfig({ ...base, AI_INVESTIGATION_ENABLED: 'maybe' })).toThrow(
      ConfigurationError,
    );
  });

  it('the demo-scenarios production assertion still fires on a real true', () => {
    expect(() =>
      loadConfig({
        ...base,
        NODE_ENV: 'production',
        AUTH_ADAPTER: 'oidc',
        DEMO_SCENARIOS_ENABLED: 'true',
      }),
    ).toThrow(/Demo scenario routes/);
  });

  it('and does NOT fire when the flag is the string "false"', () => {
    const config = loadConfig({
      ...base,
      NODE_ENV: 'production',
      AUTH_ADAPTER: 'oidc',
      DEMO_SCENARIOS_ENABLED: 'false',
    });
    expect(config.DEMO_SCENARIOS_ENABLED).toBe(false);
  });
});
