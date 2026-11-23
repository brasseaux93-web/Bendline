# Bendline `/lib/calc` Test Fixtures

This directory contains deterministic JSON test suites (`>= 20` cases per calculator) and `synthetic-test-tables.json`.

## Important Data Integrity Rule
- `synthetic-test-tables.json` holds **synthetic, non-code-book test fixtures** used solely to verify mathematical interpolation, boundary enforcement, typed errors, and practice question generation.
- Production IPC/UPC code tables live exclusively in Supabase (`public.code_tables`) and Dexie offline storage, keyed by `(code_family, edition)`, entered and verified by the product owner.
- Tests in `src/lib/calc/__tests__/calc.test.ts` assert `>= 20` cases per calculator and throw `EmptyFixturesError` loudly if any fixture array is empty or incomplete.
