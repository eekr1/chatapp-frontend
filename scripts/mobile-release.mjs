import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidRoot = path.join(root, 'android');
const distRoot = path.join(root, 'dist');
const bundledRoot = path.join(androidRoot, 'app', 'src', 'main', 'assets', 'public');
const artifactRoot = path.join(root, 'artifacts');
const releasePath = path.join(root, 'release', 'talkx-release.json');
const artifactRecordPath = path.join(artifactRoot, 'release-artifact.json');
const release = JSON.parse(readFileSync(releasePath, 'utf8'));

const fail = (message) => {
  throw new Error(message);
};

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const run = (command, args, options = {}) => {
  const isBatch = process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(command);
  const result = spawnSync(isBatch ? process.env.ComSpec : command, isBatch ? ['/d', '/c', command, ...args] : args, {
    cwd: options.cwd || root,
    env: options.env || process.env,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.capture ? `\n${result.stdout || ''}${result.stderr || ''}` : '';
    fail(`${command} exited with ${result.status}.${detail}`);
  }
  return options.capture ? `${result.stdout || ''}${result.stderr || ''}` : '';
};

const executable = (base) => process.platform === 'win32' ? `${base}.cmd` : base;
const gradleExecutable = () => path.join(androidRoot, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');

const resolveJavaHome = () => {
  const candidates = [
    process.env.JAVA_HOME,
    process.platform === 'win32' ? 'C:\\Program Files\\Android\\Android Studio\\jbr' : null,
  ].filter(Boolean);
  for (const candidate of candidates) {
    const java = path.join(candidate, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
    if (existsSync(java)) return candidate;
  }
  fail('A JDK 21 JAVA_HOME is required (Android Studio jbr is accepted).');
};

const javaTool = (name, javaHome) => path.join(
  javaHome,
  'bin',
  process.platform === 'win32' ? `${name}.exe` : name,
);

export const listTree = async (directory) => {
  const files = [];
  const walk = async (current) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) files.push(path.relative(directory, absolute).replaceAll('\\', '/'));
      else fail(`Unsupported asset entry: ${absolute}`);
    }
  };
  if (!existsSync(directory)) fail(`Missing directory: ${directory}`);
  await walk(directory);
  return files.sort();
};

export const treeManifest = async (directory) => {
  const result = {};
  for (const relative of await listTree(directory)) {
    result[relative] = sha256(await readFile(path.join(directory, relative)));
  }
  return result;
};

const logicalTreeHash = (manifest) => sha256(
  Object.entries(manifest).map(([name, digest]) => `${name}\0${digest}`).join('\n'),
);

const readJson = async (target) => JSON.parse(await readFile(target, 'utf8'));

export const checkVersion = async () => {
  const packageJson = await readJson(path.join(root, 'package.json'));
  const lock = await readJson(path.join(root, 'package-lock.json'));
  const capacitor = await readJson(path.join(root, 'capacitor.config.json'));
  const errors = [];
  const version = String(release.versionName || '').trim();
  const code = Number(release.androidVersionCode);
  if (!/^\d+\.\d+\.\d+$/.test(version) || version === '0.0.0') errors.push('invalid versionName');
  if (!Number.isInteger(code) || code <= Number(release.previousAndroidVersionCode)) errors.push('versionCode is not monotonic');
  if (release.releaseId !== `talkx-${version}-${code}`) errors.push('releaseId does not match version identity');
  if (packageJson.version !== version || lock.version !== version || lock.packages?.['']?.version !== version) errors.push('package/lock version drift');
  if (capacitor.appId !== release.applicationId) errors.push('Capacitor applicationId drift');
  if (release.environment !== 'production' || release.channel !== 'internal') errors.push('release environment/channel mismatch');
  if (!/^[a-f0-9]{40}$/.test(String(release.backendSourceCommit || ''))) errors.push('backend source commit is invalid');
  if (errors.length) fail(`Version gate failed: ${errors.join('; ')}`);
  console.log(`[mobile-release] version ok: ${release.releaseId} (${release.environment}/${release.channel})`);
};

export const syncAndroid = async () => {
  if (!existsSync(distRoot)) fail('dist is missing; build the web release first.');
  const expected = path.resolve(androidRoot, 'app', 'src', 'main', 'assets', 'public');
  if (path.resolve(bundledRoot) !== expected || !expected.startsWith(path.resolve(androidRoot) + path.sep)) {
    fail('Refusing to clean an unexpected Android asset path.');
  }
  await rm(expected, { recursive: true, force: true });
  run(executable('npx'), ['cap', 'sync', 'android']);
};

export const checkAssets = async () => {
  const web = await treeManifest(distRoot);
  const android = await treeManifest(bundledRoot);
  const capacitorBootstrap = ['cordova.js', 'cordova_plugins.js'];
  for (const name of capacitorBootstrap) {
    if (!android[name]) fail(`Missing Capacitor bootstrap asset: ${name}`);
  }
  const comparableAndroid = Object.fromEntries(
    Object.entries(android).filter(([name]) => !capacitorBootstrap.includes(name)),
  );
  const names = new Set([...Object.keys(web), ...Object.keys(comparableAndroid)]);
  const mismatches = [...names].filter((name) => web[name] !== comparableAndroid[name]);
  if (mismatches.length) fail(`Android asset tree differs from dist: ${mismatches.slice(0, 12).join(', ')}`);
  const digest = logicalTreeHash(web);
  console.log(`[mobile-release] asset tree ok: ${Object.keys(web).length} files, sha256 ${digest}`);
  return { files: Object.keys(web).length, sha256: digest };
};

const parseEnv = async () => Object.fromEntries(
  (await readFile(path.join(root, '.env'), 'utf8'))
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*([^#=]+)=(.*)$/))
    .filter(Boolean)
    .map((match) => [match[1].trim(), match[2].trim()]),
);

export const checkConfig = async () => {
  const env = await parseEnv();
  const allowedHosts = new Set(release.backendHosts || []);
  for (const [name, expectedProtocol] of [['VITE_API_URL', 'https:'], ['VITE_WS_URL', 'wss:']]) {
    const value = env[name];
    if (!value) fail(`${name} is required for the production mobile release.`);
    const parsed = new URL(value);
    if (parsed.protocol !== expectedProtocol || !allowedHosts.has(parsed.host)) fail(`${name} is outside the production allowlist.`);
  }
  const files = await listTree(distRoot);
  const forbiddenNames = files.filter((name) => name.endsWith('.map'));
  if (forbiddenNames.length) fail(`Public source maps found: ${forbiddenNames.join(', ')}`);
  const textual = files.filter((name) => /\.(?:html|js|css|json|xml|txt)$/i.test(name));
  const forbidden = /(?:(?:https?|wss?):\/\/(?:localhost|127\.0\.0\.1|10\.0\.2\.2)(?::\d+)|sourceMappingURL=|(?:https?|wss?):\/\/[^/]*staging\.)/i;
  for (const name of textual) {
    const source = await readFile(path.join(distRoot, name), 'utf8');
    if (forbidden.test(source)) fail(`Forbidden debug/staging marker in dist/${name}`);
  }
  const emitted = await readJson(path.join(distRoot, 'release-manifest.json'));
  if (JSON.stringify(emitted) !== JSON.stringify(release)) fail('Emitted release manifest differs from canonical release intent.');
  console.log('[mobile-release] production config and bundle scan ok');
};

const findMergedManifest = async () => {
  const candidates = [
    path.join(androidRoot, 'app', 'build', 'intermediates', 'merged_manifest', 'release', 'processReleaseMainManifest', 'AndroidManifest.xml'),
    path.join(androidRoot, 'app', 'build', 'intermediates', 'merged_manifests', 'release', 'processReleaseManifest', 'AndroidManifest.xml'),
  ];
  return candidates.find(existsSync) || path.join(androidRoot, 'app', 'src', 'main', 'AndroidManifest.xml');
};

export const checkManifest = async () => {
  const manifestPath = await findMergedManifest();
  const source = await readFile(manifestPath, 'utf8');
  const permissions = [...source.matchAll(/<uses-permission[^>]+android:name="([^"]+)"/g)].map((match) => match[1]);
  const allowed = new Set([
    'android.permission.ACCESS_NETWORK_STATE',
    'android.permission.CAMERA',
    'android.permission.INTERNET',
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.READ_EXTERNAL_STORAGE',
    'android.permission.READ_MEDIA_IMAGES',
    'android.permission.RECEIVE_BOOT_COMPLETED',
    'android.permission.SCHEDULE_EXACT_ALARM',
    'android.permission.USE_EXACT_ALARM',
    'android.permission.VIBRATE',
    'android.permission.WAKE_LOCK',
    'com.google.android.c2dm.permission.RECEIVE',
    `${release.applicationId}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`,
  ]);
  const unexpected = permissions.filter((permission) => !allowed.has(permission));
  if (unexpected.length) fail(`Unexpected Android permissions: ${unexpected.join(', ')}`);
  if (!permissions.includes('android.permission.INTERNET')) fail('INTERNET permission is missing.');
  if (!/android:allowBackup="false"/.test(source) || !/android:usesCleartextTraffic="false"/.test(source)) fail('Backup/cleartext release policy drift.');
  const componentTags = [...source.matchAll(/<(?:activity|service|receiver|provider)\b[^>]*>/g)].map((match) => match[0]);
  const exportedTrue = componentTags
    .filter((tag) => /android:exported="true"/.test(tag))
    .map((tag) => ({
      name: tag.match(/android:name="([^"]+)"/)?.[1],
      permission: tag.match(/android:permission="([^"]+)"/)?.[1] || '',
    }))
    .filter(Boolean);
  const allowedExported = new Map([
    [`${release.applicationId}.MainActivity`, ''],
    ['com.google.firebase.iid.FirebaseInstanceIdReceiver', 'com.google.android.c2dm.permission.SEND'],
    ['androidx.profileinstaller.ProfileInstallReceiver', 'android.permission.DUMP'],
  ]);
  const unexpectedExported = exportedTrue.filter((component) => (
    !allowedExported.has(component.name) || allowedExported.get(component.name) !== component.permission
  ));
  if (unexpectedExported.length) fail(`Unexpected exported component: ${unexpectedExported.map((item) => item.name).join(', ')}`);
  console.log(`[mobile-release] manifest ok (${path.relative(root, manifestPath)}): ${permissions.sort().join(', ')}`);
  return permissions.sort();
};

const outputAab = () => path.join(androidRoot, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');

const verifySignature = async (artifactPath = null, javaHome = null) => {
  const record = !artifactPath && existsSync(artifactRecordPath) ? await readJson(artifactRecordPath) : null;
  const target = artifactPath || record?.artifactPath && path.join(root, record.artifactPath);
  if (!target || !existsSync(target)) fail('Signed release artifact is missing.');
  const home = javaHome || resolveJavaHome();
  const verification = run(javaTool('jarsigner', home), ['-verify', '-verbose', '-certs', target], { capture: true });
  if (!/jar verified\./i.test(verification)) fail('jarsigner did not verify the release artifact.');
  const cert = run(javaTool('keytool', home), ['-printcert', '-jarfile', target], { capture: true });
  const fingerprint = cert.match(/SHA-256:\s*([0-9A-F:]+)/i)?.[1] || cert.match(/SHA256:\s*([0-9A-F:]+)/i)?.[1];
  if (!fingerprint) fail('Unable to read the signing certificate SHA-256 fingerprint.');
  const digest = sha256(await readFile(target));
  if (record && (record.sha256 !== digest || record.certificateSha256 !== fingerprint)) fail('Artifact checksum/signature record drift.');
  console.log(`[mobile-release] signature ok: SHA-256 ${fingerprint}`);
  return { digest, fingerprint };
};

const bundleRelease = (signingEnv) => {
  if (!signingEnv?.TALKX_ANDROID_KEYSTORE_PATH) fail('Protected signing environment is required.');
  const javaHome = resolveJavaHome();
  run(gradleExecutable(), ['--no-daemon', 'clean', 'bundleRelease'], {
    cwd: androidRoot,
    env: { ...process.env, ...signingEnv, JAVA_HOME: javaHome },
  });
  return javaHome;
};

const packageRelease = async () => {
  await checkVersion();
  run(executable('npm'), ['run', 'quality:all']);
  await syncAndroid();
  const assets = await checkAssets();
  await checkConfig();

  const javaHome = resolveJavaHome();
  const temp = await mkdtemp(path.join(os.tmpdir(), 'talkx-internal-rc-'));
  const keystore = path.join(temp, 'internal-rc.p12');
  const alias = 'talkx-internal-rc';
  const password = randomBytes(32).toString('base64url');
  const signingEnv = {
    TALKX_ANDROID_KEYSTORE_PATH: keystore,
    TALKX_ANDROID_KEYSTORE_PASSWORD: password,
    TALKX_ANDROID_KEY_ALIAS: alias,
    TALKX_ANDROID_KEY_PASSWORD: password,
    TALKX_RC_STORE_PASSWORD: password,
  };

  try {
    run(javaTool('keytool', javaHome), [
      '-genkeypair', '-alias', alias, '-keyalg', 'RSA', '-keysize', '3072', '-validity', '30',
      '-dname', 'CN=TalkX Internal RC,O=TalkX,C=TR', '-storetype', 'PKCS12', '-keystore', keystore,
      '-storepass:env', 'TALKX_RC_STORE_PASSWORD', '-keypass:env', 'TALKX_RC_STORE_PASSWORD', '-noprompt',
    ], { env: { ...process.env, TALKX_RC_STORE_PASSWORD: password } });
    bundleRelease(signingEnv);
    await checkManifest();
    await mkdir(artifactRoot, { recursive: true });
    const artifactName = `${release.releaseId}-${release.channel}.aab`;
    const artifactPath = path.join(artifactRoot, artifactName);
    await cp(outputAab(), artifactPath);
    const signed = await verifySignature(artifactPath, javaHome);
    const frontendCommit = run('git', ['rev-parse', 'HEAD'], { capture: true }).trim();
    const record = {
      schemaVersion: 1,
      releaseId: release.releaseId,
      versionName: release.versionName,
      androidVersionCode: release.androidVersionCode,
      applicationId: release.applicationId,
      environment: release.environment,
      channel: release.channel,
      signingProfile: 'ephemeral-internal-rc',
      certificateSha256: signed.fingerprint,
      sha256: signed.digest,
      assetTreeSha256: assets.sha256,
      frontendSourceCommit: frontendCommit,
      backendSourceCommit: release.backendSourceCommit,
      artifactPath: path.relative(root, artifactPath).replaceAll('\\', '/'),
      playUploadAuthorized: false,
    };
    await writeFile(artifactRecordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    const artifactBytes = await readFile(artifactPath);
    if (artifactBytes.includes(Buffer.from(password))) fail('Secret sentinel found in release artifact.');
    console.log(`[mobile-release] internal RC ready: ${record.artifactPath}`);
    console.log(`[mobile-release] artifact sha256: ${record.sha256}`);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
};

const command = process.argv[2];
const commands = {
  version: checkVersion,
  sync: syncAndroid,
  assets: checkAssets,
  config: checkConfig,
  manifest: checkManifest,
  bundle: async () => bundleRelease(process.env),
  signature: () => verifySignature(),
  package: packageRelease,
};

if (command) {
  if (!commands[command]) fail(`Unknown mobile release command: ${command}`);
  await commands[command]();
}
