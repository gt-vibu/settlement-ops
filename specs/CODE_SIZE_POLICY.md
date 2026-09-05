# Code Size Policy

The goal of the file-size policy is reviewability and security, not arbitrary aesthetics.

- Prefer <250 lines for source files.
- 250–350 lines requires review of responsibility boundaries.
- >350 lines should normally be split.
- >500 lines requires written justification in `PHASE_REVIEW.md` and is not allowed by default.
- A file must not combine unrelated architectural responsibilities merely to avoid creating modules.

Large generated files are excluded where the generator is deterministic and not hand-maintained business logic.
