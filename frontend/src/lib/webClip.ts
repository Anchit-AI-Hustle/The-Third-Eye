// An iOS configuration profile holding one Web Clip: tapping it in Safari and
// installing it from Settings puts a full-screen The Third Eye icon on the home
// screen, with no App Store or Apple Developer account. The UUIDs are fixed so
// installing again replaces the same profile. IgnoreManifestScope keeps Google
// sign-in inside the clip (without it iOS hands the Google page to Safari, and
// the session cookie lands there instead of in the app); ?app=webclip tells
// the sign-in screen it can use that direct path.

const PROFILE_UUID = "6F1B6A51-2C4E-4C1D-9B7A-3E5D2A8C4F10";
const CLIP_UUID = "A3C7E2D9-5B1F-4E8A-8C6D-1F2B3A4C5D60";

export function webClipProfile(origin: string, iconBase64: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>PayloadContent</key><array><dict>
<key>PayloadType</key><string>com.apple.webClip.managed</string>
<key>PayloadVersion</key><integer>1</integer>
<key>PayloadIdentifier</key><string>com.thethirdeye.jarvis.webclip</string>
<key>PayloadUUID</key><string>${CLIP_UUID}</string>
<key>PayloadDisplayName</key><string>The Third Eye</string>
<key>URL</key><string>${origin}/dashboard?app=webclip</string>
<key>Label</key><string>The Third Eye</string>
<key>Icon</key><data>${iconBase64}</data>
<key>FullScreen</key><true/>
<key>IgnoreManifestScope</key><true/>
<key>IsRemovable</key><true/>
<key>Precomposed</key><true/>
</dict></array>
<key>PayloadType</key><string>Configuration</string>
<key>PayloadVersion</key><integer>1</integer>
<key>PayloadIdentifier</key><string>com.thethirdeye.jarvis</string>
<key>PayloadUUID</key><string>${PROFILE_UUID}</string>
<key>PayloadDisplayName</key><string>The Third Eye app</string>
<key>PayloadDescription</key><string>Adds The Third Eye to your home screen as a full-screen app.</string>
<key>PayloadOrganization</key><string>The Third Eye</string>
<key>PayloadRemovalDisallowed</key><false/>
</dict></plist>
`;
}
