import SwiftUI

/// A task-based guide that explains the personal features in plain language.
struct HowToUseView: View {
    var body: some View {
        List {
            Section("Start here") {
                Text("Type or speak naturally in Assistant. Say what you want done, such as ‘Add buy groceries to my tasks for tomorrow’ or ‘Save a note that my passport expires in June.’ Review any action that asks for your approval.")
            }
            Section("Assistant") {
                Text("Ask questions, make plans, and create or update things in your account. Be specific about dates. Use the microphone to dictate; use Call for a hands-free conversation. Check the result in Tasks, Notes, or the relevant feature.")
                Text("Try: ‘Plan my day around my 2pm appointment.’").foregroundStyle(Theme.secondary)
            }
            Section("Tasks") {
                Text("A task is something you intend to do. Add one in Tasks or ask the Assistant. Tap the circle when it is finished. Open a task to add details, priority, or a due date.")
                Text("Try: ‘Remind me to call Mum tomorrow at 6.’").foregroundStyle(Theme.secondary)
            }
            Section("Notes") {
                Text("Use a note for information you want to keep, not an action you need to finish. Create it with +, or ask the Assistant to save something. Open a note to edit it.")
                Text("Try: ‘Save the Wi-Fi details for the guest room.’").foregroundStyle(Theme.secondary)
            }
            Section("Life Log") {
                Text("Choose Record my day when you want a day summary. Allow microphone access, leave recording on while you go about your day, then stop it to build the timeline. You can also write a diary entry without recording. Review the transcript before relying on it; add a diary correction if something was misheard. Audio files are removed after transcription.")
                Text("Recording uses the phone microphone and may use battery. Stop it when you no longer want it listening.").foregroundStyle(Theme.secondary)
            }
            Section("Goals") {
                Text("Track progress toward a result that takes time. Add a goal with a target and unit, then update your progress. Use Tasks for the next actions that move the goal forward.")
            }
            Section("Knowledge") {
                Text("Keep reference material you want the Assistant to use later. Add useful notes or documents, then refer to them by name in a question.")
                Text("Try: ‘Use my interview notes to help me prepare.’").foregroundStyle(Theme.secondary)
            }
            Section("Finance") {
                Text("Review or record supported personal money information. Check entries for accuracy before relying on totals. Open More → Finance to see the available actions.")
            }
            Section("Create & grow") {
                Text("Studio makes drafts and other generated work. Skills save reusable instructions. Job Agent helps organize a job search. Kolab is for creator collaboration. These features are optional; you do not need them to use Assistant, Tasks, or Notes.")
            }
            Section("Apps and connected services") {
                Text("Apps opens available tools. Connectors link supported external accounts so the Assistant can work with them. Connect only services you want and review permissions first. Without a connection, some actions may only prepare a link or draft for you to finish.")
            }
            Section("Music, health, and other tools") {
                Text("Open Apps to see tools available on your account. Music tools help find or create music; Health tools help organize wellness information; Anchor and other named tools have their own instructions on their screen. Availability can depend on your phone and connected services.")
                Text("If you ask the Assistant to play a song, check that playback actually starts in the music app; opening a search page alone is not playback.").foregroundStyle(Theme.secondary)
            }
            Section("Online Agents and Generations") {
                Text("Online Agents are specialist assistants for particular jobs. Generations keeps a history of work created by tools. For a normal question or everyday task, start in Assistant.")
            }
            Section("Reminders") {
                Text("Ask the Assistant to remind you about something at a time or date. Allow notifications so the phone can show it. Check the wording and time zone in the confirmation.")
                Text("Try: ‘Remind me to take the bins out at 8 tonight.’").foregroundStyle(Theme.secondary)
            }
            Section("Settings, plans, and activity") {
                Text("Settings controls your account and preferences. Plans & Credits shows usage limits. Agent Activity shows actions the Assistant attempted. Capabilities lists integrations and availability. These pages help troubleshoot; they are not daily setup steps.")
            }
            Section("Microphone and privacy") {
                Text("Voice features need microphone permission. Life Log records only while you turn it on. You can stop at any time and use text instead. Automatic speech filtering reduces some noise, but it can still mistake other voices or loud sounds. Review transcripts before relying on them.")
            }
        }
        .scrollContentBackground(.hidden)
        .background(Starfield())
        .navigationTitle("How to use the app")
        .navigationBarTitleDisplayMode(.inline)
    }
}
