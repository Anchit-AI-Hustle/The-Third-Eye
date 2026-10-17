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

## Android without a local SDK

The **Android APK** workflow (`.github/workflows/android-apk.yml`) builds a
debug APK on GitHub's runner for free. Run it from the Actions tab (or it runs
on any change to `android/`). Builds from `main` also publish the APK to the
public `android-latest` release, which the site's `/install` page links for a
one-tap download. A store release still needs the signed bundle below.

iOS has no install outside the App Store or TestFlight, so `/install` walks
iPhone users through Safari's Add to Home Screen instead.

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

## Permissions

`AndroidManifest.xml` and `Info.plist` declare the grants the web layer needs.
Capacitor's WebView maps the web APIs onto them, so no bridge code is required (contacts is the exception: it uses the native plugin, called from `hooks/useLocalContacts.ts`):

| Web call | Android | iOS |
| --- | --- | --- |
| `getUserMedia` (wake word, day recorder) | `RECORD_AUDIO` | `NSMicrophoneUsageDescription` |
| `Notification.requestPermission()` | `POST_NOTIFICATIONS` | n/a — see below |
| `geolocation` | `ACCESS_*_LOCATION` | `NSLocationWhenInUseUsageDescription` |
| Contacts sync (`@capacitor-community/contacts`) | `READ_CONTACTS`, `WRITE_CONTACTS` | `NSContactsUsageDescription` |

| SMS and calls (`DeviceControl.sendSms` / `call`, `lib/nativeOutreach.ts`) | `SEND_SMS`, `CALL_PHONE` | not possible - Messages / dialer open instead |

In the Android app an SMS or call JARVIS was asked for goes out over the phone's
own SIM straight away (one-time permission prompt); the reply says whether the
SMS was sent. Google Play only allows `SEND_SMS` and `CALL_PHONE` for the
default SMS / dialer app, so the debug APK keeps them and a Play build must
drop them. iOS gives no app a way to send an SMS or place a call by itself.

Without these the calls fail silently inside the app while still working in a
browser tab, which is the confusing failure mode they exist to prevent.

## Push notifications

Web push (VAPID) works in the PWA, in Android Chrome, and — now that
`POST_NOTIFICATIONS` is declared — inside the Android app. `usePush` handles
registration and the cron dispatcher already fans out to stored subscriptions.

**iOS is the exception.** WKWebView does not implement the Web Push API, so the
web subscription never registers inside the iOS app. That one needs
`@capacitor/push-notifications` (installed, currently unused), an APNs key, and a
`token` column on `push_subscriptions` to store device tokens next to web ones.

## Known gap: background microphone

`UIBackgroundModes: audio` lets iOS keep an audio session alive when the app
leaves the foreground. Android needs more than a permission: a foreground
service typed `microphone`, started when capture begins and stopped with it.
`FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_MICROPHONE` are declared for it, but
the service class is not written yet — so on Android, capture still stops when
the app is backgrounded, exactly as it does in a browser tab.
