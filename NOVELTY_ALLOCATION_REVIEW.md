# Novelty Allocation Review

**Date:** 2026-09-01
**Status:** `PROPOSED — AWAITING OWNER APPROVAL`. Blocks dataset generation.
**Constraint honoured:** total dataset budget unchanged at **410 cases**.

---

## 1. The design problem

CC-011 made novelty the primary experimental variable, but `EXPERIMENT_CONSTANTS.md` §7
allocates only by **cause**. Allocating by novelty introduces a tension:

- Six strata across 120 primary-test cases produces small cells.
- `COMPOUND_UNSEEN` is the most interesting stratum **and** the smallest.
- Making the project's validity depend on ~12 cases would be indefensible.

The resolution is not more cases — the budget is fixed — but **deciding in advance which
strata carry a statistical claim and which are descriptive**, and never blurring the two.

---

## 2. Allocation

### Primary test — 120 cases

| Stratum | Count | % | Role |
|---|---:|---:|---|
| `SEEN` | **48** | 40% | Powered — control arm of the primary comparison |
| `NOVEL_COMBINATION` | **30** | 25% | Powered, pooled into `NOVEL` |
| `NOVEL_CONFIGURATION` | **12** | 10% | Powered, pooled into `NOVEL` |
| `COMPOUND_UNSEEN` | **12** | 10% | Powered, pooled into `NOVEL`; **descriptive alone** |
| `AMBIGUOUS` | **12** | 10% | Abstention measurement |
| `ADVERSARIAL` | **6** | 5% | Abstention measurement |
| **Total** | **120** | | |

### Challenge — 60 cases

| Stratum | Count | % |
|---|---:|---:|
| `SEEN` | **0** | 0% |
| `NOVEL_COMBINATION` | **21** | 35% |
| `NOVEL_CONFIGURATION` | **6** | 10% |
| `COMPOUND_UNSEEN` | **21** | 35% |
| `AMBIGUOUS` | **9** | 15% |
| `ADVERSARIAL` | **3** | 5% |
| **Total** | **60** | |

The challenge split contains **no `SEEN` cases at all**. That is its purpose.

### Build splits

| Split | Cases | Composition |
|---|---:|---|
| development | 120 | **100% `SEEN` by definition** — it is what defines the term |
| validation | 60 | 70% `SEEN`, 20% `NOVEL_COMBINATION`, 10% `NOVEL_CONFIGURATION` |
| showcase | 50 | Mixed, **never scored** |

Validation contains some novelty deliberately: Systems B and C may tune against unfamiliar
cases without ever touching the scored splits.

---

## 3. Powered versus descriptive — the decision that protects the claim

### 3.1 The primary powered comparison

> **`SEEN` (n=48) versus `NOVEL` (n=54) within the primary test split**, where
> `NOVEL` = `NOVEL_COMBINATION` + `NOVEL_CONFIGURATION` + `COMPOUND_UNSEEN`.

Pooling the three novel strata is what makes the hypothesis testable at this budget.
Comparison is **paired** — every case is scored under A, B and C — so the analysis is on
discordant pairs, which is materially more efficient than comparing independent groups.

**Honest power statement.** At n≈54 per arm on a paired proportion comparison, the minimum
reliably detectable difference is roughly **12–18 percentage points**, depending on how
often the systems actually disagree. A 5-point difference will not be distinguishable from
noise, and the report must say so rather than presenting a point estimate as a finding.

This is a real limitation of the 410-case budget, and it is stated before generation rather
than discovered afterwards.

### 3.2 Descriptive strata — no preregistered claim

| Stratum | n (primary) | n (challenge) | Treatment |
|---|---:|---:|---|
| `COMPOUND_UNSEEN` | 12 | 21 | **Descriptive only.** Always with its CI. Never a standalone claim |
| `AMBIGUOUS` | 12 | 9 | Descriptive; feeds abstention quality |
| `ADVERSARIAL` | 6 | 3 | Descriptive; qualitative — 6 cases supports an observation, not a rate |

**`COMPOUND_UNSEEN` may be discussed across both scored splits (33 cases total) as a
descriptive observation, explicitly labelled as such.** It is never pooled into a
preregistered statistic, because `EVALUATION.md` §16 requires challenge results to be
reported separately from the primary test.

> **The rule in one line:** the project's validity rests on `SEEN` vs `NOVEL` at n≈102
> across the primary split, never on the 12-case `COMPOUND_UNSEEN` cell.

### 3.3 The challenge split

Reported **separately**, as `EVALUATION.md` §16 requires. Its role is confirmatory: does the
`NOVEL` advantage seen in the primary test survive on combinations that appear in no other
split? Retention threshold in `EXPERIMENT_CONSTANTS.md` X3.

---

## 4. How novelty is constructed from development

Novelty is **derived by lookup against a frozen registry**, never hand-labelled.

### 4.1 Generation order — development first

```
1. Generate the DEVELOPMENT split.
2. Build the COMBINATION REGISTRY from it:
      cause tuples emitted        e.g. {MDR_FEE}, {REFUND_NETTING}, {MDR_FEE, TIMING_LAG}
      configuration buckets       per tuple: amount band, timing band, line-count band
3. FREEZE the registry. Hash it into the manifest.
4. Generate the remaining splits, assigning novelty by lookup against the frozen registry.
```

Development must be generated **first**, because `SEEN` has no meaning until it exists.

### 4.2 Classification rules — applied in order

| Order | Stratum | Rule |
|---:|---|---|
| 1 | `ADVERSARIAL` | Case carries an injected tempting-but-impossible explanation |
| 2 | `AMBIGUOUS` | Oracle confirms no unique supported cause (see `EVALUATION.md` Part IV) |
| 3 | `COMPOUND_UNSEEN` | ≥2 causes **and** tuple ∉ registry |
| 4 | `NOVEL_COMBINATION` | Every individual cause ∈ registry singles, tuple ∉ registry |
| 5 | `NOVEL_CONFIGURATION` | Tuple ∈ registry, configuration bucket ∉ registry for that tuple |
| 6 | `SEEN` | Tuple ∈ registry and configuration bucket ∈ registry |

Order matters: a case that is both compound-unseen and ambiguous is labelled `AMBIGUOUS`,
because what is being measured there is abstention, not generalisation.

### 4.3 Configuration buckets

| Dimension | Buckets |
|---|---|
| Amount | <₹1k · ₹1k–10k · ₹10k–100k · >₹100k |
| Timing offset | within window · 1 cycle late · >1 cycle late |
| Line count | 1 · 2–4 · 5+ |
| Payment method | CARD · NETBANKING · UPI · WALLET |

Bucket boundaries are frozen with the registry. A configuration is novel if the tuple's
bucket combination never appeared with that tuple in development.

### 4.4 Registry adequacy precondition

`NOVEL_COMBINATION` is only meaningful if development contains **every individual cause as
a single-cause case**. Otherwise a "novel combination" is really an unseen *cause*, which
is a different and much easier claim.

**Precondition, checked before generation proceeds:** all seven cause codes appear as
single-cause cases in development. Failure blocks generation.

---

## 5. Preserving cause balance — and a confound that cannot be removed

### 5.1 The requirement

Cause distribution (`EXPERIMENT_CONSTANTS.md` §7) must hold **within** each novelty stratum
as far as the stratum's definition permits. Otherwise novelty and cause are confounded and
a "novelty effect" could simply be a "compound-cases-are-harder" effect.

### 5.2 The confound that is structural, not fixable

**`COMPOUND_UNSEEN` requires ≥2 causes by definition.** It is therefore *necessarily*
correlated with the `COMPOUND` cause class. No allocation can break that.

**How it is handled:** the analysis compares **within** the compound cause class —
compound cases that are `SEEN` versus compound cases that are `COMPOUND_UNSEEN`. That
isolates the novelty effect from the difficulty effect.

This requires the primary test to contain compound-cause cases in **both** strata:

| | `SEEN` | `NOVEL`/`COMPOUND_UNSEEN` |
|---|---:|---:|
| Compound-cause cases | ≥8 | 12 |

Allocation constraint: **at least 8 of the 48 `SEEN` cases must carry a compound cause
combination present in development.** Without this the within-class comparison is
impossible and the confound stands.

### 5.3 Per-stratum cause targets (primary test)

| Cause | Overall target | `SEEN` (48) | `NOVEL` (54) |
|---|---:|---:|---:|
| `MDR_FEE` | 20% | 10 | 8 |
| `UTR_SPLIT` | 15% | 7 | 7 |
| `REFUND_NETTING` | 15% | 7 | 7 |
| `TIMING_LAG` | 15% | 7 | 6 |
| `ROUNDING_DRIFT` | 10% | 5 | 2 |
| `COMPOUND` | 13% | **8** | 12 |
| `AMBIGUOUS` | 12% | (own stratum) | (own stratum) |

Exact counts are reconciled by the generator and **recorded in the manifest before
scoring**. Deviations are reported, not silently absorbed.

---

## 6. Novelty-label leakage testing

The novelty label is hidden truth on the same footing as the gold cause — it *is* the
experimental variable. `LEAKAGE_AUDIT.md` §10 applies, with these specific probes:

| Probe | Threshold |
|---|---|
| Single visible feature → novelty stratum | balanced accuracy ≤ 0.30 (6-class chance ≈ 0.167) |
| Depth-2 tree over visible features → novelty | ≤ 0.35 |
| Record count / amount magnitude / timestamp spread → novelty | ≤ 0.30 |
| Record-ID or correlation-ID structure → stratum | must be **uncorrelated** |
| Split membership inferable from any visible field | must be **impossible** |

Two structural checks in addition:

1. **Serialization check.** No case payload, evidence item, tool result, audit event, log
   line or filename contains a novelty label or the registry hash.
2. **Registry isolation.** The combination registry lives in `settlementops_eval`. The
   application credential has no grant on it.

**A novelty leak invalidates the primary comparison**, not merely a subgroup — because the
primary comparison *is* `SEEN` vs `NOVEL`.

---

## 7. Summary of what needs approval

| # | Decision | Proposed |
|---|---|---|
| 1 | Primary test allocation | 48 / 30 / 12 / 12 / 12 / 6 |
| 2 | Challenge allocation | 0 / 21 / 6 / 21 / 9 / 3 |
| 3 | Powered comparison | `SEEN` (48) vs `NOVEL` (54), paired, primary split |
| 4 | `COMPOUND_UNSEEN` | **Descriptive only**, always with CI, never a standalone claim |
| 5 | `ADVERSARIAL` | Qualitative — 6 cases supports an observation, not a rate |
| 6 | Compound-in-`SEEN` floor | ≥8 cases, to break the compound/novelty confound |
| 7 | Registry adequacy precondition | All 7 causes present as singles in development |
| 8 | Configuration buckets | Amount / timing / line count / method, frozen with the registry |

**Accepted limitation, stated before generation:** at this budget the primary comparison
detects roughly a 12–18 pp difference. A smaller true effect will be indistinguishable from
noise, and the report will say so rather than presenting it as a result.
