# Frontend module architecture

## Current structure

The workspace is split by responsibility. `src/App.tsx` is the composition root: it owns application-wide state, persistence and cross-feature orchestration, then selects the active page through `renderWorkspacePage()`.

- `src/domain/types.ts` owns shared domain types for profiles, scholarship records and eligibility outcomes.
- `src/features/workspace/pageTypes.ts` defines explicit props for each workspace page. Page contracts must not use `any` or catch-all `Record<string, any>` models.
- `src/features/workspace/pages/` contains the Overview, Settings, Discovery, Cloud Search, Scholarships, Eligibility Filters and Application Prep page components.
- `src/components/` contains reusable presentation components: scholarship cards, form fields and status/evidence pills. Feature pages import these components directly rather than receiving component implementations through their page models.
- `src/lib/` contains reusable business logic and integrations, including eligibility, discovery, evidence, tracker, application workspace, browser storage, backup and Supabase services.
- `src/styles/` contains ordered base, theme, accessibility, editorial, navigation and design-system stylesheets. `src/App.css` is the import manifest and owns their cascade order.

## Ownership rules

1. Keep business rules, validation, persistence and service calls out of page components. Put reusable domain behavior in `src/lib/`; put shared types in `src/domain/`.
2. Keep page components focused on rendering one workspace destination. Add or change a page contract in `pageTypes.ts` when the page needs a new value or callback. Use precise callback and data types; do not widen props to `any`.
3. Put reusable UI in `src/components/` when it has a meaningful shared role or behavior. Keep page-specific markup in its feature page.
4. Keep application-wide cross-page state in the composition layer until there is a cohesive feature hook with a stable interface. Do not move persistence into a presentation component.
5. Import style modules only through `App.css` unless a component has an intentionally scoped stylesheet. Preserve import order: base, theme, accessibility, editorial, navigation, then design-system overrides.
6. Do not move student profile, academic, essay, recommendation or application workspace data into public search requests or cloud scholarship sponsor records. Preserve the current local-data boundary and public URL sanitizer.

## Regression protection

`tests/workspaceArchitecture.test.mjs` verifies that all seven routes render from separate page modules and that the page contracts remain explicit. `tests/helpers/workspaceSource.mjs` aggregates the current app, page and component source for cross-module static regression checks; page-specific behavior tests should read the owning module directly. `tests/helpers/styles.mjs` follows the imports in `src/App.css` so CSS regression tests inspect the actual styles rather than a now-empty manifest.

Run `npm test` and `npm run build` after frontend module changes. The build performs TypeScript checking and Vite production bundling. Static source checks complement these gates; they do not replace browser testing.
