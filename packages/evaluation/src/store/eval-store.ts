/**
 * Hidden-truth store.
 *
 * The ONLY component in the repository that connects to `settlementops_eval`. It is used
 * by the generator (to write truth) and by the scorer (to read it, after every treatment
 * has already finished). No API route, worker, tool or agent may import this module -
 * `scripts/check-deps.ts` fails the build if the agent package references the credential.
 *
 * The isolation is not enforced here. It is enforced by a PostgreSQL grant: the
 * application role has no CONNECT privilege on this database, so even importing this file
 * from the wrong place would fail at connect time rather than leak a label.
 */

import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

import type { CaseBlueprint } from '../generator/types.js';
import type { CombinationRegistry } from '../generator/registry.js';

export interface EvalStore {
  readonly client: Client;
  close(): Promise<void>;
}

export const openEvalStore = async (connectionString?: string): Promise<EvalStore> => {
  const url = connectionString ?? process.env['EVAL_DATABASE_URL'];
  if (url === undefined || url === '') {
    throw new Error(
      'EVAL_DATABASE_URL is not set; the evaluation harness needs its own credential',
    );
  }
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 5_000 });
  await client.connect();
  return { client, close: async () => void (await client.end().catch(() => undefined)) };
};

export interface GeneratorRunRecord {
  readonly id: string;
  readonly generatorVersion: string;
  readonly experimentVersion: string;
  readonly rootSeed: number;
  readonly configurationHash: string;
  readonly modelProvider: string;
  readonly modelName: string;
  readonly modelDigest: string;
  readonly policyVersion: string;
  readonly gitCommit: string | null;
}

export const recordGeneratorRun = async (
  store: EvalStore,
  run: GeneratorRunRecord,
): Promise<void> => {
  await store.client.query(
    `INSERT INTO generator_runs (id, generator_version, experiment_version, root_seed,
       configuration_hash, model_provider, model_name, model_digest, policy_version, git_commit)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      run.id,
      run.generatorVersion,
      run.experimentVersion,
      run.rootSeed,
      run.configurationHash,
      run.modelProvider,
      run.modelName,
      run.modelDigest,
      run.policyVersion,
      run.gitCommit,
    ],
  );
};

export const completeGeneratorRun = async (store: EvalStore, runId: string): Promise<void> => {
  await store.client.query('UPDATE generator_runs SET completed_at = now() WHERE id = $1', [runId]);
};

export const recordRegistry = async (
  store: EvalStore,
  runId: string,
  registry: CombinationRegistry,
): Promise<void> => {
  for (const entry of registry.entries) {
    await store.client.query(
      `INSERT INTO combination_registry (id, generator_run_id, cause_tuple, amount_band,
         timing_band, line_count_band, payment_method)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (generator_run_id, cause_tuple, amount_band, timing_band, line_count_band, payment_method)
       DO UPDATE SET occurrences = combination_registry.occurrences + 1`,
      [
        randomUUID(),
        runId,
        entry.causeTuple,
        entry.bucket.amountBand,
        entry.bucket.timingBand,
        entry.bucket.lineCountBand,
        entry.bucket.paymentMethod,
      ],
    );
  }
};

export const recordSplitMerchant = async (
  store: EvalStore,
  runId: string,
  split: string,
  splitSeed: number,
  merchantId: string,
  caseCount: number,
): Promise<void> => {
  await store.client.query(
    `INSERT INTO split_manifest (id, generator_run_id, split, split_seed, merchant_id, case_count)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [randomUUID(), runId, split, splitSeed, merchantId, caseCount],
  );
};

export const recordHiddenTruth = async (
  store: EvalStore,
  runId: string,
  merchantId: string,
  blueprint: CaseBlueprint,
): Promise<void> => {
  await store.client.query(
    `INSERT INTO hidden_case_truth (id, generator_run_id, split, merchant_id, payment_id,
       true_causes, true_cause_tuple, true_disposition, novelty_stratum, amount_band,
       timing_band, line_count_band, payment_method, expected_residual, discrepancy_minor,
       injection_detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (generator_run_id, payment_id) DO NOTHING`,
    [
      randomUUID(),
      runId,
      blueprint.split,
      merchantId,
      blueprint.paymentId,
      blueprint.trueCauses,
      blueprint.trueCauseTuple,
      blueprint.trueDisposition,
      blueprint.noveltyStratum,
      blueprint.bucket.amountBand,
      blueprint.bucket.timingBand,
      blueprint.bucket.lineCountBand,
      blueprint.bucket.paymentMethod,
      blueprint.expectedResidual,
      blueprint.discrepancyMinor.toString(),
      JSON.stringify(blueprint.injection),
    ],
  );
};

export interface HiddenTruthRow {
  readonly paymentId: string;
  readonly merchantId: string;
  readonly split: string;
  readonly trueCauses: readonly string[];
  readonly trueCauseTuple: string;
  readonly trueDisposition: string;
  readonly noveltyStratum: string;
  readonly discrepancyMinor: string;
}

export const loadHiddenTruth = async (
  store: EvalStore,
  runId: string,
  splits: readonly string[],
): Promise<readonly HiddenTruthRow[]> => {
  const result = await store.client.query(
    `SELECT payment_id, merchant_id, split, true_causes, true_cause_tuple, true_disposition,
            novelty_stratum, discrepancy_minor
       FROM hidden_case_truth
      WHERE generator_run_id = $1 AND split = ANY($2)`,
    [runId, splits],
  );
  return result.rows.map((r) => ({
    paymentId: String(r['payment_id']),
    merchantId: String(r['merchant_id']),
    split: String(r['split']),
    trueCauses: r['true_causes'] as string[],
    trueCauseTuple: String(r['true_cause_tuple']),
    trueDisposition: String(r['true_disposition']),
    noveltyStratum: String(r['novelty_stratum']),
    discrepancyMinor: String(r['discrepancy_minor']),
  }));
};

export const latestGeneratorRunId = async (store: EvalStore): Promise<string | null> => {
  const result = await store.client.query<{ id: string }>(
    'SELECT id FROM generator_runs WHERE completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 1',
  );
  return result.rows[0]?.id ?? null;
};
