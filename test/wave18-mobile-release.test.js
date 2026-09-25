import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { checkVersion, treeManifest } from '../scripts/mobile-release.mjs';

test('Wave 18 release identity is canonical and monotonic', async () => {
  await assert.doesNotReject(checkVersion());

  const release = JSON.parse(await readFile(new URL('../release/talkx-release.json', import.meta.url), 'utf8'));
  assert.equal(release.releaseId, `talkx-${release.versionName}-${release.androidVersionCode}`);
  assert.ok(release.androidVersionCode > release.previousAndroidVersionCode);
  assert.equal(release.environment, 'production');
  assert.equal(release.channel, 'internal');
});

test('full-tree manifest detects content and stale file differences', async () => {
  const first = await mkdtemp(path.join(os.tmpdir(), 'talkx-tree-a-'));
  const second = await mkdtemp(path.join(os.tmpdir(), 'talkx-tree-b-'));
  try {
    await mkdir(path.join(first, 'assets'));
    await mkdir(path.join(second, 'assets'));
    await writeFile(path.join(first, 'index.html'), '<main>TalkX</main>');
    await writeFile(path.join(second, 'index.html'), '<main>TalkX</main>');
    await writeFile(path.join(first, 'assets', 'app.js'), 'same');
    await writeFile(path.join(second, 'assets', 'app.js'), 'same');
    assert.deepEqual(await treeManifest(first), await treeManifest(second));

    await writeFile(path.join(second, 'assets', 'stale.js'), 'stale');
    assert.notDeepEqual(await treeManifest(first), await treeManifest(second));
  } finally {
    await rm(first, { recursive: true, force: true });
    await rm(second, { recursive: true, force: true });
  }
});

test('native lifecycle and network signals use guarded recovery paths', async () => {
  const bridge = await readFile(new URL('../src/utils/nativeBridge.js', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(bridge, /App\.addListener\('appStateChange'/);
  assert.match(app, /addNativeAppStateListener/);
  assert.match(app, /if \(isActive\) onForeground\(\)/);
  assert.match(app, /addEventListener\('online', onOnline\)/);
  assert.match(app, /addEventListener\('offline', onOffline\)/);
  assert.match(app, /readyState === WebSocket\.OPEN \|\| ws\.current\.readyState === WebSocket\.CONNECTING/);
});

test('release Gradle path is manifest-driven and rejects unsigned output', async () => {
  const gradle = await readFile(new URL('../android/app/build.gradle', import.meta.url), 'utf8');
  assert.match(gradle, /talkx-release\.json/);
  assert.match(gradle, /versionCode talkxRelease\.androidVersionCode/);
  assert.match(gradle, /versionName talkxRelease\.versionName/);
  assert.match(gradle, /verifyReleaseSigningEnvironment/);
  assert.match(gradle, /unsigned release output is forbidden/);
  assert.match(gradle, /uploadCrashlyticsMappingFileRelease/);
  assert.match(gradle, /enabled = false/);
});
