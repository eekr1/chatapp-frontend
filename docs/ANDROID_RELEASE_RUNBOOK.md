# TalkX Android Internal Release Candidate Runbook

Wave 18 uses `release/talkx-release.json` as the canonical release intent. The frontend package version, embedded release manifest, Capacitor application ID and Gradle version are verified against that file before packaging.

## Local automatic gate

Run `npm run mobile:release:package` from `chatapp-frontend` with the Android Studio JDK 21 available. The command runs the Wave 17 frontend quality gates, creates a clean production web bundle, removes the previous generated Android web-assets directory, runs Capacitor sync, compares the complete dist and Android asset trees by SHA-256, audits release config and the merged manifest, and builds a signed AAB.

The local package command creates a short-lived, self-signed **internal RC** certificate in the operating-system temp directory. Its password is passed through process environment only, never printed, and the temp directory is removed in `finally`. This certificate is not the Play upload key and the produced artifact must not be uploaded to Play. Raw `bundleRelease` fails when protected signing inputs are absent.

Ignored outputs are written under `artifacts/`:

- the immutable internal AAB;
- `release-artifact.json`, containing source identities, asset hash, artifact checksum and certificate fingerprint but no secret.

## External stop boundary

Play upload, tester/track changes, staged or production rollout, Firebase configuration changes, production deploy/restart and official upload-key access require separate explicit approval. No command in this runbook performs those operations.

The internal RC Gradle path explicitly disables `uploadCrashlyticsMappingFileRelease`; symbol/mapping upload remains an external Firebase mutation requiring separate approval.

## Halt and forward-fix dry run

If any version, asset, config, manifest, signature or checksum gate fails, do not upload the artifact. Preserve the evidence record, fix the source, increment to a new monotonic `androidVersionCode`, rebuild once and re-run all gates. A published versionCode is never reused; rollback is a rollout halt plus a higher-versionCode build from the last-known-good source or a forward fix.

## Deferred device and store evidence

Clean install/update/uninstall, min/mid/current Android and WebView coverage, system UI/keyboard/accessibility, process death, network transitions, push tap, camera/gallery return, Data Safety/content-rating review and Play rollout rehearsal remain in Checkpoint C / Wave 19. They are not automated Wave 18 commit gates.
