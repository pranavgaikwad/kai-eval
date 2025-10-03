---
description: Generate tests to verify a given functionality before/after migration
argument-hint: "[target] [description-of-the-test-to-create]"
---

Read the repository (especially architecture.md), understand the requested functionality, and produce specific, stable, and minimal E2E tests that cover the critical user path(s) only. These tests are designed to act as migration sentinels: they verify that original behavior is preserved before and after a future migration to #$1.
They must not attempt to verify migration mechanics or implementation details—only the original externally observable behavior.

# Ground rules

* Architecture-first: Use architecture.md to understand domains, components, entrypoints, and flows. Derive the smallest set of critical paths that prove the described functionality works end-to-end.
* Behavior over internals: Treat the system as a black box. Assert on user-visible or externally observable outcomes: UI content/state, HTTP responses/contracts, persisted state, emitted events, emails/queues, etc.
* Migration-safe design: When source code is migrated to the given target technology, the test should be able to verify if the functionality is maintained.
* Framework compatibility: Detect and use the project’s existing E2E tooling (e.g., Playwright/Cypress/WebdriverIO for UI; Supertest/pytest-httpx for API). If none is found, propose and use a sensible default consistent with repo stack. Keep test code colocated with existing e2e patterns and configs.
* Specificity & traceability: Tests must be concrete (exact routes, payloads, selectors, expected text/codes), self-contained (fixtures/seeds), and annotated with references to where behavior is defined (file paths/lines where helpful).
* Scope discipline: Implement only the requested scenario(s).

Here's the description of tests needed:
#$2