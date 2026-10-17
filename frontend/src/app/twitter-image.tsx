import { ImageResponse } from "next/og";

// The preview shown when a link to the site is shared (WhatsApp, X, LinkedIn, iMessage).
export const alt = "The Third Eye - your personal AI operating system";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function TwitterImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "radial-gradient(circle at 80% 20%, #1b3a5c 0%, #050505 60%)", color: "#E6EDF7" }}>
        <div style={{ fontSize: 28, letterSpacing: 8, color: "#4FC3F7", fontFamily: "monospace" }}>// J.A.R.V.I.S.</div>
        <div style={{ fontSize: 88, fontWeight: 800, marginTop: 20 }}>The Third Eye</div>
        <div style={{ fontSize: 38, marginTop: 16, color: "#9FB0C8", maxWidth: 900 }}>Your personal AI operating system. Tasks, notes, knowledge, voice and studio in one place.</div>
        <div style={{ display: "flex", marginTop: 48, fontSize: 30, color: "#050505", background: "#4FC3F7", padding: "14px 30px", borderRadius: 12, alignSelf: "flex-start", fontWeight: 700 }}>Get started</div>
      </div>
    ),
    size,
  );
}
