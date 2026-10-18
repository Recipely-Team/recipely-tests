# Maestro — native mobile E2E

Drives the **installed native Recipely app** on a real iOS Simulator or Android
Emulator. This is the true native counterpart to the Playwright device-emulation
projects (which only run the web build under a mobile viewport).

## Prerequisites

```bash
# 1. Install Maestro
curl -fsSL "https://get.maestro.mobile.dev" | bash

# 2. A running device with Recipely installed:
#    iOS:     a booted Simulator with the app (dev client or a build) installed
#    Android: a running Emulator (adb devices) with the APK installed
```

Build/install the app from the main repo, e.g. a dev client:

```bash
# in ../recipely
npx expo run:ios          # installs com.recipely.app.dev on the booted Simulator
npx expo run:android      # installs on the running Emulator
```

## App id

Flows default to the **prod** id `com.recipely.app`. Point at the dev client by
overriding `APP_ID`:

```bash
APP_ID=com.recipely.app.dev maestro test maestro/flows
```

## Run

```bash
# from recipely-tests/
npm run maestro            # every no-cost flow on the connected device
npm run maestro:ios        # flows tagged ios
npm run maestro:android    # flows tagged android

# a single flow
maestro test maestro/flows/01-login-smoke.yaml
```

## Flows

| File | Covers |
|------|--------|
| `01-login-smoke.yaml`     | App launches; login screen renders (brand, fields, CTA, social, sign-up). |
| `02-auth-navigation.yaml` | login → register → back, login → forgot-password → back. |
| `03-invalid-login.yaml`   | Real failing login round-trip → inline "Invalid email or password". |
| `04-login-and-browse.yaml`| Real sign-in (needs `MAESTRO_EMAIL`/`MAESTRO_PASSWORD`) → recipes feed. |
| `05-assistant-typing.yaml`| Assistant → "Ask by typing": the box is above the navigation bar and already focused. No model call. |
| `06-assistant-voice.yaml` | Assistant goes live with the microphone granted (v1.7.0's web-microphone bug). **`assistant-live`**: ~2 s of a real session. |
| `08-largest-text-tour.yaml` | Every main screen, screenshotted for review. Run through `maestro:largest-text`. |
| `09-search-offers-ai.yaml` | A search with no results offers “Create … with AI”, reachable with the keyboard up. No model call (the offer is not tapped). |
| `07-open-imported-draft.yaml` | Import a reel → "Open draft" → the editor opens, no crash (v1.7.0's Android crash). **`import-live`**: one real import. |

Shared steps live in `maestro/subflows/` (`past-onboarding.yaml`, `sign-in.yaml`).

## Before every production release

```bash
# 1. The release build carries the NATIVE assistant audio (no device, no cost)
npm run verify:native-bundle -- ../recipely/android/app/build/outputs/apk/release/app-release.apk

# 2. Install that build on an emulator, then every no-cost flow
npm run maestro -- -e MAESTRO_EMAIL=… -e MAESTRO_PASSWORD=…

# 3. The same flows at the LARGEST system text, and on a SMALL phone with the
#    3-button navigation bar — then LOOK at artifacts/largest-text/*.png
npm run maestro:largest-text -- -e MAESTRO_EMAIL=… -e MAESTRO_PASSWORD=…
npm run maestro:small-screen -- -e MAESTRO_EMAIL=… -e MAESTRO_PASSWORD=…

# 4. The two flows that spend a little (one import, two seconds of assistant)
npm run maestro:live -- -e MAESTRO_EMAIL=… -e MAESTRO_PASSWORD=…
```

`npm run maestro` excludes the `assistant-live` and `import-live` tags, so it never
calls a model. Credentials: the `RECIPELY_TEST_*` values in `.env`.

```bash
# authed happy path
maestro test maestro/flows/04-login-and-browse.yaml \
  -e MAESTRO_EMAIL=you@example.com -e MAESTRO_PASSWORD=secret
```

## Notes

- The app ships **no `testID`s**, so flows match on visible i18n text. Keep the
  device language **English** (the strings here are the `en` locale) or update
  the flow strings to match.
- Native flows hit the real backend (`api.recipely.net`) because the installed
  build carries the real AES envelope key — no extra config needed.
- Screenshots land in `artifacts/`.
