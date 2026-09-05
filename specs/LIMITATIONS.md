# Limitations

- Synthetic data is not real merchant data.
- Cause taxonomy is deliberately narrow.
- Live payment-network integrations are not included.
- Staging is not live accounting mutation.
- Public Razorpay documentation does not reveal every internal implementation detail.
- Model behavior may vary by provider/version.
- Reviewer studies, if conducted, are directional unless they use real target operators.
- Evaluation cannot establish actual production ROI.

## Added by readiness resolutions (2026-08-31)

- **Authentication is a demo adapter**, not an identity provider: seeded identities, no passwords, sessions, tokens, MFA or account recovery. Non-production only; a real IdP implements the same interface later (D3).
- **`APPLIED` does not mean money moved.** It means the staged action was applied to SettlementOps' own internal representation. No external system is mutated in the MVP (D4).
- **No holiday calendar.** Settlement cycles use Mon–Fri business days only (`EXPERIMENT_CONSTANTS.md` W4).
- **Single currency (INR).** No FX, and therefore no FX-related rounding causes.
- **Fee/tax rates are synthetic**, reverse-engineered from the specification's own worked example. They are not Razorpay's actual pricing and must never be presented as such.
- **All experiment constants are `PROPOSED`**, not approved. No dataset has been generated and no evaluation has been run.
- Model inference is local (Ollama). Local models are weaker at structured output and tool selection than frontier hosted models; a failed AI result may reflect model capability rather than the approach (CC-010).
