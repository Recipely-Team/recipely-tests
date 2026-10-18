#!/usr/bin/env bash
# Runs the no-cost Maestro flows with the connected device's text size at its
# MAXIMUM, then puts it back. Android: font_scale 2.0 (Android 14+'s largest).
# iOS Simulator: the largest accessibility content size.
#
#   npm run maestro:largest-text -- -e MAESTRO_EMAIL=… -e MAESTRO_PASSWORD=…
#
# Screenshots of every main screen land in artifacts/largest-text/.
set -u
ANDROID_MAX=2.0
IOS_MAX=accessibility-extra-extra-extra-large

android_before=""
if command -v adb >/dev/null && adb get-state >/dev/null 2>&1; then
  android_before=$(adb shell settings get system font_scale | tr -d '\r')
  adb shell settings put system font_scale "$ANDROID_MAX"
fi
ios_device=$(xcrun simctl list devices booted 2>/dev/null | grep -Eo '[0-9A-F-]{36}' | head -1 || true)
if [ -n "$ios_device" ]; then
  xcrun simctl ui "$ios_device" content_size "$IOS_MAX"
fi

restore() {
  if [ -n "$android_before" ]; then adb shell settings put system font_scale "$android_before"; fi
  if [ -n "$ios_device" ]; then xcrun simctl ui "$ios_device" content_size large; fi
}
trap restore EXIT

mkdir -p artifacts/largest-text
maestro test maestro/flows --exclude-tags=assistant-live,import-live "$@"
status=$?
# Maestro writes screenshots under its own run folder; bring the tour's here.
latest=$(ls -td ~/.maestro/tests/*/ | head -1)
find "$latest" -path '*largest-text*' -name '*.png' -exec cp {} artifacts/largest-text/ \;
echo "screenshots: artifacts/largest-text/"
exit $status
