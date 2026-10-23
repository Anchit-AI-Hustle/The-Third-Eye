// What the composer's mic button shows. It used to read "on" only while
// dictating, so in call mode the listening mic looked switched off.
export function micButton(micOn: boolean, voiceMode: string) {
  if (!micOn) return { live: false, title: "Dictate - speech fills the box, doesn't send", tone: "off" as const };
  if (voiceMode === "dictate") return { live: true, title: "Stop dictation", tone: "dictate" as const };
  return { live: true, title: "Listening - tap to end the call", tone: "call" as const };
}
