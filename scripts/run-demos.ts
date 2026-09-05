/**
 * End-to-end Demo runner for SettlementOps with Qwen3 8B.
 *
 * Runs:
 * - DEMO A: Successful Investigation (fee-tax-discrepancy -> MDR_FEE -> Verifier -> Approve -> Stage)
 * - DEMO B: Safe Abstention (ambiguous-adjustment -> Insufficient Evidence -> Refusal -> Escalate)
 * - DEMO C: Model Failure (Ollama unavailable -> /ready 503 -> Safe Escalation -> Audit logged)
 */

import { randomUUID } from 'node:crypto';
import { createDemoAuthAdapter } from '../apps/api/src/auth/demo-adapter.js';
import { buildApp } from '../apps/api/src/app.js';
import {
  createAuditReader,
  createAuditWriter,
  createCaseRepository,
  createCaseTransitionRepository,
  createDatabase,
  createEvidenceRequestRepository,
  createImportRepository,
  createInvestigationRepository,
  createRecordRepository,
  createRunRepository,
  createScenarioRepository,
  createUserDirectory,
} from '@settlementops/persistence';
import { createOllamaGateway, loadAgentBudget } from '@settlementops/agent';
import { dispatchAgent } from '../apps/api/src/agent-dispatch.js';
import { cryptoIdGenerator, systemClock } from '@settlementops/shared';
import { EXPLORATORY_AI_V2_MODEL } from '@settlementops/evaluation';

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgres://settlementops_app:local_dev_only@localhost:5434/settlementops_app';

const adminHeaders = { 'x-demo-user-id': 'demo-admin' };
const operatorHeaders = { 'x-demo-user-id': 'demo-operator' };
const approverHeaders = { 'x-demo-user-id': 'demo-approver' };

function createServer(
  db: ReturnType<typeof createDatabase>,
  host: string,
  timeoutSec: number,
): ReturnType<typeof buildApp> {
  const agentBudget = loadAgentBudget();
  const modelCfg = {
    host,
    model: EXPLORATORY_AI_V2_MODEL.model,
    digest: EXPLORATORY_AI_V2_MODEL.digest,
    temperature: 0,
    requestTimeoutSeconds: timeoutSec,
    maxOutputTokens: 512,
    maxRetries: 2,
  };

  return buildApp({
    auth: createDemoAuthAdapter(createUserDirectory(db)),
    db,
    logLevel: 'silent',
    v1: {
      imports: createImportRepository(db),
      records: createRecordRepository(db),
      runs: createRunRepository(db),
      cases: createCaseRepository(db),
      audit: createAuditWriter(db),
    },
    workflow: {
      scenarios: createScenarioRepository(db),
      imports: createImportRepository(db),
      records: createRecordRepository(db),
      runs: createRunRepository(db),
      cases: createCaseRepository(db),
      transitions: createCaseTransitionRepository(db),
      investigations: createInvestigationRepository(db),
      evidence: createEvidenceRequestRepository(db),
      audit: createAuditWriter(db),
      demoScenariosEnabled: true,
      aiInvestigationEnabled: true,
      dispatchAgent: (ctx, input) =>
        dispatchAgent(
          {
            db,
            model: modelCfg,
            budget: agentBudget,
            workflow: {
              investigations: createInvestigationRepository(db),
              transitions: createCaseTransitionRepository(db),
              audit: createAuditWriter(db),
              ids: cryptoIdGenerator(),
              clock: systemClock(),
            },
          },
          ctx,
          input,
        ),
    },
    auditReader: createAuditReader(db),
    modelHealth: () =>
      createOllamaGateway({
        host,
        identity: EXPLORATORY_AI_V2_MODEL,
        temperature: 0,
        timeoutSeconds: 5,
        maxOutputTokens: 1,
      }).assertPinnedModel(),
  });
}

export interface DemoReport {
  demoA: Record<string, unknown>;
  demoB: Record<string, unknown>;
  demoC: Record<string, unknown>;
}

export async function runDemos(): Promise<DemoReport> {
  process.env['AGENT_LOOP_VARIANT'] = 'v2';
  const db = createDatabase(DATABASE_URL);
  const app = createServer(db, 'http://127.0.0.1:11434', 60);
  await app.ready();

  // === DEMO A: SUCCESSFUL INVESTIGATION ===
  const startA = Date.now();
  const seedA = Math.floor(Math.random() * 800000) + 100000;
  await app.inject({
    method: 'POST',
    url: '/v1/demo/scenarios/fee-tax-discrepancy/instantiate',
    headers: { ...adminHeaders, 'idempotency-key': randomUUID() },
    payload: { seed: seedA },
  });
  const casesResA = await app.inject({
    method: 'GET',
    url: '/v1/cases?limit=1',
    headers: operatorHeaders,
  });
  const activeCaseA = casesResA.json().items[0];
  const caseIdA = activeCaseA.id;

  const invStartA = Date.now();
  const invResA = await app.inject({
    method: 'POST',
    url: `/v1/cases/${caseIdA}/investigations`,
    headers: operatorHeaders,
    payload: { case_version: 1 },
  });
  const invDurA = Date.now() - invStartA;

  const approveResA = await app.inject({
    method: 'POST',
    url: `/v1/cases/${caseIdA}/approve`,
    headers: approverHeaders,
    payload: { case_version: 3, note: 'Approved MDR fee variance resolution' },
  });

  const stageResA = await app.inject({
    method: 'POST',
    url: `/v1/cases/${caseIdA}/stage`,
    headers: approverHeaders,
    payload: {
      case_version: approveResA.json().case_version ?? 4,
      action_type: 'STAGE_LEDGER_ADJUSTMENT',
      amount_minor: activeCaseA.discrepancy_amount_minor,
    },
  });

  const auditResA = await app.inject({
    method: 'GET',
    url: `/v1/cases/${caseIdA}/audit`,
    headers: operatorHeaders,
  });
  const auditEventsA = auditResA.json().items as Array<Record<string, unknown>>;
  const demoAReport = {
    caseId: caseIdA,
    scenario: 'fee-tax-discrepancy',
    seed: seedA,
    investigationId: invResA.json().investigation_id,
    model: EXPLORATORY_AI_V2_MODEL.model,
    digest: EXPLORATORY_AI_V2_MODEL.digest,
    agentOutcome: invResA.json().agent,
    finalState: stageResA.json().state,
    auditEvents: auditEventsA,
    investigationLatencyMs: invDurA,
    totalEndToEndMs: Date.now() - startA,
  };

  // === DEMO B: SAFE ABSTENTION ===
  const startB = Date.now();
  const seedB = Math.floor(Math.random() * 800000) + 100000;
  await app.inject({
    method: 'POST',
    url: '/v1/demo/scenarios/ambiguous-adjustment/instantiate',
    headers: { ...adminHeaders, 'idempotency-key': randomUUID() },
    payload: { seed: seedB },
  });
  const casesResB = await app.inject({
    method: 'GET',
    url: '/v1/cases?limit=1',
    headers: operatorHeaders,
  });
  const activeCaseB = casesResB.json().items[0];
  const caseIdB = activeCaseB.id;

  const invStartB = Date.now();
  const invResB = await app.inject({
    method: 'POST',
    url: `/v1/cases/${caseIdB}/investigations`,
    headers: operatorHeaders,
    payload: { case_version: 1 },
  });
  const invDurB = Date.now() - invStartB;

  const caseStateB = await app.inject({
    method: 'GET',
    url: `/v1/cases/${caseIdB}`,
    headers: operatorHeaders,
  });
  const auditResB = await app.inject({
    method: 'GET',
    url: `/v1/cases/${caseIdB}/audit`,
    headers: operatorHeaders,
  });
  const demoBReport = {
    caseId: caseIdB,
    scenario: 'ambiguous-adjustment',
    seed: seedB,
    investigationId: invResB.json().investigation_id,
    model: EXPLORATORY_AI_V2_MODEL.model,
    agentOutcome: invResB.json().agent,
    finalState: caseStateB.json().state,
    auditEvents: auditResB.json().items as Array<Record<string, unknown>>,
    investigationLatencyMs: invDurB,
    totalEndToEndMs: Date.now() - startB,
  };

  // === DEMO C: MODEL FAILURE & RECOVERY ===
  const deadApp = createServer(db, 'http://127.0.0.1:59999', 2);
  await deadApp.ready();
  const readyC = await deadApp.inject({ method: 'GET', url: '/ready' });

  const seedC = Math.floor(Math.random() * 800000) + 100000;
  await deadApp.inject({
    method: 'POST',
    url: '/v1/demo/scenarios/fee-tax-discrepancy/instantiate',
    headers: { ...adminHeaders, 'idempotency-key': randomUUID() },
    payload: { seed: seedC },
  });
  const casesResC = await deadApp.inject({
    method: 'GET',
    url: '/v1/cases?limit=1',
    headers: operatorHeaders,
  });
  const activeCaseC = casesResC.json().items[0];
  const caseIdC = activeCaseC.id;

  const invResC = await deadApp.inject({
    method: 'POST',
    url: `/v1/cases/${caseIdC}/investigations`,
    headers: operatorHeaders,
    payload: { case_version: 1 },
  });
  const caseStateC = await deadApp.inject({
    method: 'GET',
    url: `/v1/cases/${caseIdC}`,
    headers: operatorHeaders,
  });
  const auditResC = await deadApp.inject({
    method: 'GET',
    url: `/v1/cases/${caseIdC}/audit`,
    headers: operatorHeaders,
  });

  await deadApp.close();
  await app.close();
  await db.close();

  return {
    demoA: demoAReport,
    demoB: demoBReport,
    demoC: {
      readyStatusCode: readyC.statusCode,
      readyResponse: readyC.json(),
      caseId: caseIdC,
      scenario: 'fee-tax-discrepancy',
      investigationId: invResC.json().investigation_id,
      agentOutcome: invResC.json().agent,
      finalState: caseStateC.json().state,
      auditEvents: auditResC.json().items as Array<Record<string, unknown>>,
    },
  };
}

if (process.argv[1]?.endsWith('run-demos.ts')) {
  runDemos()
    .then((report) => console.log('DEMO REPORT JSON:\n' + JSON.stringify(report, null, 2)))
    .catch((err) => {
      console.error('Demo execution error:', err);
      process.exit(1);
    });
}
