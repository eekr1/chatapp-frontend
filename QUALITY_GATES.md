# TalkX Frontend Quality Gates

Wave 17 Sale Release minimum gate is `npm run quality:all`. It runs the guard self-test, all Node-based client contract tests, the focused auth/match/reconnect/duplicate suite, ESLint, the production build and a high-severity production dependency audit.

The test runner fails before execution when its manifest discovers zero files or zero `test(...)` declarations. Frontend tests also reject live database or provider configuration; they use only local deterministic modules and synthetic fixtures.

`Frontend quality` is the stable GitHub check name. The workflow has read-only repository contents permission, uses lockfile installation, pins external actions to immutable commit SHAs, has no deploy job and receives no application secrets. A failed, cancelled or missing job is not converted to success; there is no automatic retry or `continue-on-error`.

Browser/device/manual accessibility checks remain in Checkpoint C / Wave 19. Android version, signing, bundle, device parity and store operations belong to Wave 18 and are not performed by this gate.
