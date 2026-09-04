# Wreck-Less Jump Calculator

A React Native / Expo mobile app that helps users calculate jump distances and angles for dirt jumps, MTB trails, and similar activities.

## Project Structure

```
frontend/   – Expo / React Native app
backend/    – Python API server
```

## Getting the Android APK

**Quick start (cloud build via EAS):**

```bash
cd frontend
npm install -g eas-cli
eas login
yarn install
yarn build:apk:cloud
```

A download link and QR code will be provided when the build finishes.

For detailed instructions (local build, CI/CD, troubleshooting), see **[BUILD_APK.md](./BUILD_APK.md)**.

## Running Locally (Development)

```bash
cd frontend
yarn install
yarn start        # opens Expo dev server
yarn android      # opens on connected Android device / emulator
```

## Backend

```bash
cd backend
pip install -r requirements.txt
python server.py
```
