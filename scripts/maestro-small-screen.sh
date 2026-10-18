#!/usr/bin/env bash
# Runs the no-cost Maestro flows on a SMALL phone (360×640 dp, the smallest
# common Android size) with the 3-button navigation bar, then restores the
# emulator. Android only — it reshapes the connected emulator with `wm`.
#
#   npm run maestro:small-screen -- -e MAESTRO_EMAIL=… -e MAESTRO_PASSWORD=…
#
# Why: on small phones the login screen's Google/Apple buttons and "Continue
# without an account" scrolled down under the navigation bar and could not be
# tapped. Flow 01 taps the last of them, so that comes back as a failure.
set -u
adb get-state >/dev/null 2>&1 || { echo "no Android device connected"; exit 2; }
THREE_BUTTON=com.android.internal.systemui.navbar.threebutton

restore() {
  adb shell wm size reset
  adb shell wm density reset
}
trap restore EXIT

adb shell wm size 720x1280
adb shell wm density 320
adb shell cmd overlay enable "$THREE_BUTTON" >/dev/null 2>&1 || true
mkdir -p artifacts/small-screen
maestro test maestro/flows --exclude-tags=assistant-live,import-live "$@"
