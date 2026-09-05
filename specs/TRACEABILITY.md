# Requirements Traceability

| Requirement | Source document | Implementation owner | Verification |
|---|---|---|---|
| persistent product state | PRD | workflow/application | integration tests |
| deterministic financial truth | PRODUCT_PRINCIPLES | domain/verifier | unit tests |
| residual-only AI | PRD/EVALUATION | reconciliation + agent | benchmark |
| bounded dispositions | DISPOSITION_SCHEMA | agent/verifier | schema tests |
| human approval | APPROVAL_AND_STAGING | workflow/API | integration |
| no money movement | SAFETY | tools/workflow | security tests |
| tenant isolation | SECURITY | auth/repository/tools | security matrix |
| scenario parity | SCENARIO_ENGINE | application | scenario tests |
| leakage prevention | LEAKAGE_AUDIT | evaluation | pre-freeze audit |
| code-size controls | CODE_SIZE_POLICY | CI | CI gate |
