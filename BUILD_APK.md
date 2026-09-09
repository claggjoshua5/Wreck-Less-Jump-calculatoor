# Building the Android APK

This guide explains how to build an Android APK for the **Wreck-Less Jump Calculator** app using [EAS Build](https://docs.expo.dev/build/introduction/) (Expo Application Services).

---

## Prerequisites

Before you begin, make sure you have the following installed:

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 18 or later | https://nodejs.org |
| npm / yarn | latest | bundled with Node.js |
| EAS CLI | latest | `npm install -g eas-cli` |
| Expo account | free | https://expo.dev/signup |

> **Android Studio / Java are only required for fully local builds** (no EAS account needed). See [Local Build (No Account)](#option-b-local-build-no-expo-account) below.

---

## Option A: Cloud Build via EAS (Recommended)

This is the easiest method. EAS builds the APK on Expo's servers and gives you a download link.

### Step 1 – Install EAS CLI

```bash
npm install -g eas-cli
```

### Step 2 – Log in to Expo

```bash
eas login
```

### Step 3 – Navigate to the frontend directory

```bash
cd frontend
```

### Step 4 – Configure EAS (first time only)

```bash
eas build:configure
```

Accept all defaults. This links the project to your Expo account.

### Step 5 – Build the APK

```bash
yarn build:apk:cloud
# or
eas build --platform android --profile preview
```

EAS will start a cloud build. When it finishes (typically 10–15 minutes), you will receive:
- A **QR code** you can scan on your Android phone to install the APK directly.
- A **download link** in the terminal and at https://expo.dev/accounts/[your-username]/projects.

### Step 6 – Install on Android

1. On your Android device, go to **Settings → Security** and enable **Install from Unknown Sources** (or **Install Unknown Apps**).
2. Open the download link from Step 5 on your phone, download the APK, and tap it to install.

---

## Option B: Local Build (No Expo Account)

Build the APK entirely on your own machine. Requires Android SDK / Android Studio.

### Requirements

- [Android Studio](https://developer.android.com/studio) with Android SDK installed
- Java 17 (bundled with Android Studio or install via `brew install openjdk@17`)
- `ANDROID_HOME` environment variable pointing to your SDK

### Step 1 – Install dependencies

```bash
cd frontend
yarn install
```

### Step 2 – Run the local EAS build

```bash
yarn build:apk
# or
eas build --platform android --profile preview --local
```

The APK will be output to a path similar to:

```
./build-*.apk
```

### Step 3 – Copy the APK to your Android device

Transfer the `.apk` file to your phone via USB, email, or cloud storage, then tap it to install.

---

## Option C: Expo Go (Development / Testing Only)

For quick development testing without building an APK:

1. Install **Expo Go** from the Google Play Store on your Android device.
2. From the `frontend/` directory, run:
   ```bash
   yarn start
   ```
3. Scan the QR code shown in the terminal with the Expo Go app.

> **Note:** Expo Go does not support all native modules. Use the APK build for the full experience.

---

## Build Profiles Reference

The `frontend/eas.json` file defines these build profiles:

| Profile | Command | Output | Notes |
|---------|---------|--------|-------|
| `preview` | `yarn build:apk:cloud` | `.apk` | Cloud build, easy sharing |
| `local-apk` | `yarn build:apk` | `.apk` | Built locally on your machine |
| `development` | `yarn build:apk:debug` | `.apk` (dev client) | Includes dev tools |
| `production` | `eas build --platform android --profile production` | `.aab` | For Google Play Store |

---

## Troubleshooting

### `eas: command not found`
Run `npm install -g eas-cli` and make sure your npm global bin is in your `PATH`.

### Build fails with "No credentials found"
Run `eas credentials` to set up a keystore. For testing, let EAS generate one automatically.

### `gradlew: Permission denied`
```bash
chmod +x android/gradlew
```

### App won't install on Android
Enable **Install Unknown Apps** for your browser or file manager in Android Settings → Apps → Special App Access.

---

## CI/CD – GitHub Actions

The repository includes a `.github/workflows/android-apk.yml` workflow that automatically builds a debug APK on every push to `main`. The resulting APK is available as a GitHub Actions artifact named **`debug-apk`** under the **Actions** tab of the repository.
