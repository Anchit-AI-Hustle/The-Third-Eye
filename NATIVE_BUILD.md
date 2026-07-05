# Native app builds (iOS + Android)

JARVIS ships as a Capacitor native shell that loads the live Vercel app
(`server.url` in `capacitor.config.ts`), so the store apps always run the latest
web release with no re-submission. Native code adds push, splash, and status bar.

## One-time setup (on a Mac for iOS; any OS for Android)

```bash
npm install                 # root — installs Capacitor + native plugins
# point capacitor.config.ts `server.url` at your production URL first
npm run cap:add:ios         # creates ios/  (requires macOS + Xcode)
npm run cap:add:android     # creates android/ (requires Android Studio + JDK 17)
npm run cap:sync
```

## Build & run

```bash
npm run cap:ios             # syncs + opens Xcode  → Product ▸ Archive → App Store Connect
npm run cap:android         # syncs + opens Android Studio → Build ▸ Generate Signed Bundle
```

## What you must supply (accounts / signing)

- **Apple**: Apple Developer Program ($99/yr), a Bundle ID matching `com.jarvis.app`,
  a signing certificate + provisioning profile (Xcode manages these), and APNs
  key for push.
- **Google Play**: Play Console ($25 once), an upload keystore, and a Firebase
  project for FCM push.
- **Icons/splash**: drop a 1024×1024 icon and splash into `resources/` and run
  `npx @capacitor/assets generate` to produce every size.

## Push notifications

Web push (VAPID) already works in the PWA and Android Chrome. For native push,
wire `@capacitor/push-notifications` to register the device token and store it
alongside the web subscription — the cron dispatcher already fans out to stored
subscriptions.
