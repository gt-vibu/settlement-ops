/**
 * Isolated DEMO A Runner: Successful Investigation.
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

process.env['AGENT_LOOP_VARIANT'] = 'v2';

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgres://settlementops_app:local_dev_only@localhost:5434/settlementops_app';

async function main() {
  const db = createDatabase(DATABASE_URL);
  const agentBudget = loadAgentBudget();

  const modelConfig = {
    host: 'http://127.0.0.1:11434',
    model: EXPLORATORY_AI_V2_MODEL.model,
    digest: EXPLORATORY_AI_V2_MODEL.digest,
    temperature: 0,
    requestTimeoutSeconds: 60,
    maxOutputTokens: 512,
    maxRetries: 2,
  };

  const app = buildApp({
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
            model: modelConfig,
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
        host: modelConfig.host,
        identity: EXPLORATORY_AI_V2_MODEL,
        temperature: 0,
        timeoutSeconds: 10,
        maxOutputTokens: 1,
      }).assertPinnedModel(),
  });

  await app.ready();

  const adminHeaders = { 'x-demo-user-id': 'demo-admin' };
  const operatorHeaders = { 'x-demo-user-id': 'demo-operator' };
  const approverHeaders = { 'x-demo-user-id': 'demo-approver' };

  console.log('--- DEMO A: RUNNING SUCCESSFUL INVESTIGATION ---');
  const startTime = Date.now();

  const seed = Math.floor(Math.random() * 800000) + 100000;
  const inst = await app.inject({
    method: 'POST',
    url: '/v1/demo/scenarios/fee-tax-discrepancy/instantiate',
    headers: { ...adminHeaders, 'idempotency-key': randomUUID() },
    payload: { seed },
  });
  console.log('Scenario instantiated:', inst.json());

  const casesRes = await app.inject({
    method: 'GET',
    url: '/v1/cases?limit=1',
    headers: operatorHeaders,
  });
  const activeCase = casesRes.json().items[0];
  console.log('Exception case found:', activeCase);

  const invStart = Date.now();
  console.log('Starting investigation on case ID:', activeCase.id);
  const invRes = await app.inject({
    method: 'POST',
    url: `/v1/cases/${activeCase.id}/investigations`,
    headers: operatorHeaders,
    payload: { case_version: 1 },
  });
  const invDuration = Date.now() - invStart;
  console.log(`Investigation finished in ${invDuration}ms:`, invRes.json());

  const caseAfterInv = await app.inject({
    method: 'GET',
    url: `/v1/cases/${activeCase.id}`,
    headers: operatorHeaders,
  });
  console.log('Case state after investigation:', caseAfterInv.json());

  let approveRes = null;
  let stageRes = null;
  if (caseAfterInv.json().state === 'ACTION_PROPOSED') {
    console.log('Human approver approving proposed action...');
    approveRes = await app.inject({
      method: 'POST',
      url: `/v1/cases/${activeCase.id}/approve`,
      headers: approverHeaders,
      payload: { case_version: 2, note: 'Approved MDR_FEE resolution backed by fee schedule' },
    });
    console.log('Approve response:', approveRes.json());

    console.log('Staging approved action intent...');
    stageRes = await app.inject({
      method: 'POST',
      url: `/v1/cases/${activeCase.id}/stage`,
      headers: approverHeaders,
      payload: {
        case_version: 3,
        action_type: 'STAGE_LEDGER_ADJUSTMENT',
        amount_minor: activeCase.discrepancy_amount_minor,
      },
    });
    console.log('Stage response:', stageRes.json());
  }

  const auditRes = await app.inject({
    method: 'GET',
    url: `/v1/cases/${activeCase.id}/audit`,
    headers: operatorHeaders,
  });
  const auditEvents = auditRes.json().items;
  console.log(`Audit trail (${auditEvents.length} events):`);
  auditEvents.forEach((e: Record<string, unknown>, i: number) => {
    console.log(
      `  [${i + 1}] ${e.event_type} (${e.actor_type}) payload:`,
      JSON.stringify(e.payload),
    );
  });

  const totalTime = Date.now() - startTime;
  console.log(`DEMO A Total Time: ${totalTime}ms`);

  await app.close();
  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
