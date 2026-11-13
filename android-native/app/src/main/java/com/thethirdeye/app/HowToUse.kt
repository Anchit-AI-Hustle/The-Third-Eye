package com.thethirdeye.app

import androidx.compose.material3.Text
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Plain-language, task-based guide for people using the app on their own. */
@Composable
fun HowToUseScreen(onBack: () -> Unit) {
    ListScreen("How to use The Third Eye", loaded = true, refresh = {}, onBack = onBack) {
        item("start") {
            Panel {
                SectionLabel("Start here")
                Text("You can use The Third Eye by typing or speaking naturally. Start in Assistant and say what you want done, for example: ‘Add buy groceries to my tasks for tomorrow’ or ‘Save a note that my passport expires in June.’ Review any action that asks for your approval.", fontSize = 14.sp)
            }
        }
        item("assistant") { GuideCard("Assistant", "Ask questions, make plans, and create or update things in your account. Be specific about dates and what you want. Use the microphone for dictation; use Call for a hands-free conversation. Check the result in Tasks, Notes, or the relevant feature.", "Try: ‘Plan my day around my 2pm appointment.’") }
        item("tasks") { GuideCard("Tasks", "A task is something you intend to do. Add one here or ask the Assistant. Tap the circle when it is finished. Open a task to add details, priority, or a due date. Use a short action as its title.", "Try: ‘Remind me to call Mum tomorrow at 6.’") }
        item("notes") { GuideCard("Notes", "Use a note for information you want to keep, not an action you need to finish. Create it with +, or ask the Assistant to save something. Open a note to edit it; delete it with the bin icon.", "Try: ‘Save the Wi-Fi details for the guest room.’") }
        item("lifelog") { GuideCard("Life Log", "Open Life Log and choose Record my day when you want a day summary. Allow microphone access, keep recording on while you go about your day, then stop it to build the timeline. You can also write a diary entry without recording. Review the transcript before relying on it; add a diary correction if something was misheard. Audio is removed after transcription.", "Recording uses the phone microphone and may use battery. Stop it when you no longer want it listening.") }
        item("goals") { GuideCard("Goals", "Track progress toward a result that takes time. Add a goal with a target and unit, then update your current progress. Use Tasks for the next actions that move the goal forward.", "Example: read 12 books this year; update the count as you go.") }
        item("knowledge") { GuideCard("Knowledge", "Keep reference material you want the Assistant to use later. Add useful notes or documents, then refer to them by name in a question.", "Try: ‘Use my interview notes to help me prepare.’") }
        item("finance") { GuideCard("Finance", "Use the personal finance area to review or record supported money information. Check entries for accuracy before relying on totals.", "Open More → Finance to see the available actions.") }
        item("life") { GuideCard("Other personal tools", "Life Log captures a spoken day; Notes keep deliberate reference information; Tasks track actions; Goals track progress. Choose the one that matches what you want to remember.", "When unsure, ask the Assistant where something belongs.") }
        item("create") { GuideCard("Create & grow", "Studio makes drafts and other generated work. Skills save reusable instructions. Job Agent helps organize a job search. Kolab is for creator collaboration. Open a feature and follow its prompts; review generated content before using it.", "These are optional. You do not need to configure them to use the Assistant, Tasks, or Notes.") }
        item("apps") { GuideCard("Apps and connected services", "Apps opens available tools. Connectors link supported external accounts so the Assistant can work with them. Connect only the services you want, and review permissions before connecting.", "Without a connection, some actions may only prepare a link or draft for you to finish.") }
        item("tools") { GuideCard("Music, health, and other tools", "Open Apps to see the tools available on your account. Music tools help find or create music; Health tools help organize wellness information; Anchor and other named tools have their own instructions on their screen. Availability can depend on your phone and connected services.", "If you ask the Assistant to play a song, check that playback actually starts in the music app; opening a search page alone is not playback.") }
        item("agents") { GuideCard("Online Agents and Generations", "Online Agents are specialist assistants for particular jobs. Generations keeps a history of work created by tools. Use these when you need a focused workflow or want to find a previous result.", "For a normal question or everyday task, start in Assistant instead.") }
        item("reminders") { GuideCard("Reminders", "Ask the Assistant to remind you about something at a time or date. Allow notifications so the phone can show the reminder. Check the wording and time zone in the confirmation.", "Try: ‘Remind me to take the bins out at 8 tonight.’") }
        item("system") { GuideCard("Settings, plans, and activity", "Settings controls your account and app preferences. Plans & Credits shows usage limits. Agent Activity shows actions the assistant attempted. Capabilities lists integrations and availability. These pages help troubleshoot; they are not daily setup steps.", "If a request fails, check the message in Assistant first, then Connections or Plans & Credits if it mentions access or credits.") }
        item("privacy") { GuideCard("Microphone and privacy", "Voice features need microphone permission. Life Log records only while you turn it on. You can stop at any time and use text instead. Ask the Assistant to edit or remove saved tasks and notes, or use their delete controls.", "Automatic speech filtering reduces some noise, but it can still mistake other voices or loud sounds. Review transcripts before relying on them.") }
    }
}

@Composable
private fun GuideCard(title: String, body: String, example: String) {
    Panel {
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            SectionLabel(title)
            Text(body, fontSize = 14.sp)
            Text(example, fontSize = 12.sp, color = Palette.secondary, modifier = Modifier.padding(top = 2.dp))
        }
    }
}
