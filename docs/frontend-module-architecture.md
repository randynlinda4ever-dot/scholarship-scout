# Frontend module architecture

> **Status at GitHub commit 6147370a (2026-11-27): preserved, not active.** The current runtime still lazy-loads the monolithic `src/App.tsx` from `src/main.tsx` after `LegalAcceptanceGate`. The page modules, shared components, and split styles described here are preserved refactor work; the active app does not yet import or render them. Do not describe this refactor as complete or delete these contributions. See [the source reconciliation record](source-reconciliation-2026-11-27.md).

## Preserved target structure

The intended modular workspace split is by responsibility. When integrated, `src/App.tsx` should remain the composition root for application-wide state, persistence, and cross-feature orchestration, then select pages through an explicit workspace renderer. At the inspected commit this target structure is not active.

- `src/domain/types.ts` owns shared domain types for profiles, scholarship records and eligibility outcomes.
- `src/features/workspace/pageTypes.ts` defines explicit props for each workspace page. Page contracts must not use `any` or catch-all `Record<string, any>` models.
- `src/features/workspace/pages/` contains the Overview, Settings, Discovery, Cloud Search, Scholarships, Eligibility Filters and Application Prep page components.
- `src/components/` contains reusable presentation components: scholarship cards, form fields and status/evidence pills. Feature pages import these components directly rather than receiving component implementations through their page models.
- `src/lib/` contains reusable business logic and integrations, including eligibility, discovery, evidence, tracker, application workspace, browser storage, backup and Supabase services.
- `src/styles/` contains ordered base, theme, accessibility, editorial, navigation and design-system stylesheets. `src/App.css` is the import manifest and owns their cascade order.

## Target ownership rules

1. Keep business rules, validation, persistence and service calls out of page components. Put reusable domain behavior in `src/lib/`; put shared types in `src/domain/`.
2. Keep page components focused on rendering one workspace destination. Add or change a page contract in `pageTypes.ts` when the page needs a new value or callback. Use precise callback and data types; do not widen props to `any`.
3. Put reusable UI in `src/components/` when it has a meaningful shared role or behavior. Keep page-specific markup in its feature page.
4. Keep application-wide cross-page state in the composition layer until there is a cohesive feature hook with a stable interface. Do not move persistence into a presentation component.
5. Import style modules only through `App.css` unless a component has an intentionally scoped stylesheet. Preserve import order: base, theme, accessibility, editorial, navigation, then design-system overrides.
6. Do not move student profile, academic, essay, recommendation or application workspace data into public search requests or cloud scholarship sponsor records. Preserve the current local-data boundary and public URL sanitizer.

## Regression protection for the preserved refactor

`preserved-github-work/tests/workspaceArchitecture.test.mjs` verifies the proposed seven-route page-module architecture. `preserved-github-work/tests/helpers/workspaceSource.mjs` aggregates the preserved app, page and component source for cross-module static regression checks; page-specific behavior tests should read the owning module directly. `preserved-github-work/tests/helpers/styles.mjs` follows the proposed split-style imports. These tests apply to the preserved refactor work, not the active monolithic runtime until that refactor is integrated.

Run `npm test` and `npm run build` after frontend module changes. The build performs TypeScript checking and Vite production bundling. Static source checks complement these gates; they do not replace browser testing.
