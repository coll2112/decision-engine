# Package development

- Keep changes within `@coll2112/decision-engine`; do not edit consuming games or publish without an explicit request.
- Keep the engine renderer-agnostic. Hosts own timers, storage, and presentation.
- Keep one canonical schema for conditions and effects, with shared evaluation and validation.
- Getters must not navigate, change history, or reconcile schedules. Clone persisted scheduling records at API boundaries.
- Preserve saved scheduling identities, timestamps, and delivery flags. Validate loaded data before replacing state.
- Add runtime and public TypeScript API coverage for behavior changes, update README documentation, and bump both package manifests when releasing changes.
- Run `npm run verify` before completing implementation work; it also builds `dist`.
