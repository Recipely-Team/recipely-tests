#!/usr/bin/env node
/**
 * Proves a NATIVE Recipely build carries the native voice-assistant audio, not
 * the web one. No device, no network, no model call — it reads the JS bundle
 * inside the build.
 *
 * Why: v1.7.0 shipped the WEB microphone and player to Android and iOS.
 * `@live-assistant/audio` maps them to `.web.js` through package.json
 * `browser`, and Metro reads `browser` on native. `getUserMedia` does not
 * exist on a phone, so the assistant said "Recipely needs the microphone to
 * hear you" with access granted, never asked, and played nothing. Every gate
 * was green because Jest and the web build load the right files.
 *
 * Accepts an Android `.apk`, an iOS `.ipa`, or an iOS `.app` folder:
 *   node scripts/assert-native-assistant-bundle.mts ../recipely/android/app/build/outputs/apk/release/app-release.apk
 *   node scripts/assert-native-assistant-bundle.mts path/to/Recipely.app
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/** Strings only the native microphone (`microphone.js`) contains: its iOS audio-session options. */
const NATIVE_MARKERS = ['voiceChat', 'allowBluetoothHFP'] as const;
/** Strings only the web microphone (`microphone.web.js`) contains. */
const WEB_MARKERS = ['getUserMedia'] as const;
const MAX_BUFFER = 256 * 1024 * 1024;

const unzipEntry = (archive: string, entry: string): Buffer =>
  execFileSync('unzip', ['-p', archive, entry], { maxBuffer: MAX_BUFFER });

const readBundle = (build: string): Buffer => {
  if (statSync(build).isDirectory()) {
    const bundle = path.join(build, 'main.jsbundle');
    if (!existsSync(bundle)) throw new Error(`no main.jsbundle in ${build}`);
    return readFileSync(bundle);
  }
  if (build.endsWith('.apk')) return unzipEntry(build, 'assets/index.android.bundle');
  if (build.endsWith('.ipa')) return unzipEntry(build, 'Payload/*.app/main.jsbundle');
  throw new Error(`expected an .apk, an .ipa or an .app folder, got ${build}`);
};

const build = process.argv[2];
if (build === undefined || !existsSync(build)) {
  console.error('usage: node scripts/assert-native-assistant-bundle.mts <app.apk | app.ipa | App.app>');
  process.exit(2);
}

// Hermes bytecode keeps string literals as bytes, so a latin1 view finds them.
const text = readBundle(build).toString('latin1');
const missing = NATIVE_MARKERS.filter((marker) => !text.includes(marker));
const leaked = WEB_MARKERS.filter((marker) => text.includes(marker));

if (missing.length > 0 || leaked.length > 0) {
  console.error(`✗ ${path.basename(build)} would run the WEB assistant audio on a phone:`);
  for (const marker of missing) console.error(`  · native microphone marker missing: ${marker}`);
  for (const marker of leaked) console.error(`  · web microphone marker present: ${marker}`);
  console.error('  Fix: metro.config.js must resolve @live-assistant/audio without "browser" on native.');
  process.exit(1);
}
console.log(`✓ ${path.basename(build)}: native microphone and player (${NATIVE_MARKERS.join(', ')}), no ${WEB_MARKERS.join(', ')}`);
