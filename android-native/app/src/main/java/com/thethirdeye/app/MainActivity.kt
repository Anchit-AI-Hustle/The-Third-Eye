package com.thethirdeye.app

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Chat
import androidx.compose.material.icons.outlined.CheckBox
import androidx.compose.material.icons.outlined.Dashboard
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Menu
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect

class MainActivity : ComponentActivity() {
    private val session: Session by viewModels()
    private val app: AppState by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (savedInstanceState == null) handle(intent)
        setContent { TheThirdEyeTheme { Root(session, app) } }
    }

    private var claimed = false

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handle(intent)
    }

    override fun onResume() {
        super.onResume()
        // Came back from the sign-in tab without a code (closed it).
        if (!claimed) session.returned()
        claimed = false
    }

    private fun handle(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme == "thethirdeye" && data.host == "auth") {
            claimed = true
            session.claim(data.getQueryParameter("code"), data.getQueryParameter("state"))
        }
    }
}

// Which tab is showing, and a question to hand the Assistant tab (Today's
// quick asks open the Assistant with it, like the website's Today page).
class AppState : ViewModel() {
    enum class Tab(val label: String, val icon: ImageVector) {
        Today("Today", Icons.Outlined.Dashboard),
        Assistant("Assistant", Icons.AutoMirrored.Outlined.Chat),
        Tasks("Tasks", Icons.Outlined.CheckBox),
        Notes("Notes", Icons.Outlined.Description),
        More("More", Icons.Outlined.Menu),
    }

    var tab by mutableStateOf(Tab.Today)
    var pendingAsk by mutableStateOf<String?>(null)

    fun ask(text: String) {
        pendingAsk = text
        tab = Tab.Assistant
    }
}

@Composable
fun Root(session: Session, app: AppState) {
    val context = LocalContext.current
    when (session.state) {
        Session.State.Checking -> Backdrop { CircularProgressIndicator(Modifier.align(Alignment.Center), color = Palette.blue) }
        Session.State.SignedOut -> SignInScreen(session)
        Session.State.SignedIn -> {
            // Reminders the assistant set are scheduled on the phone each time the app comes to the front.
            val scope = rememberCoroutineScope()
            val askNotify = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
            LaunchedEffect(Unit) {
                if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    askNotify.launch(Manifest.permission.POST_NOTIFICATIONS)
                }
            }
            LifecycleResumeEffect(Unit) {
                scope.launch { Reminders.sync(context) }
                onPauseOrDispose {}
            }
            LaunchedEffect(session.email) {
                welcomeLine(context.getSharedPreferences("welcome", Context.MODE_PRIVATE), session.email, session.name)?.let { line ->
                    val voice = Voice(context)
                    voice.speakWhenReady(line) { voice.release() }
                }
            }
            MainTabs(session, app)
        }
    }
}

/** The assistant greets each account aloud the first time it signs in on this device; marks it welcomed. */
fun welcomeLine(prefs: SharedPreferences, email: String?, name: String?, agent: String = "JARVIS"): String? {
    if (email == null || prefs.getBoolean("welcomed:$email", false)) return null
    prefs.edit().putBoolean("welcomed:$email", true).apply()
    val first = name?.trim()?.split(Regex("\\s+"))?.firstOrNull()?.takeIf { it.isNotEmpty() }
    return "Welcome to The Third Eye${first?.let { ", $it" } ?: ""}. I'm $agent, your assistant. Ask me anything, any time."
}

// The same five tabs as the website's phone layout.
@Composable
fun MainTabs(session: Session, app: AppState) {
    Scaffold(
        containerColor = Palette.background,
        bottomBar = {
            NavigationBar(containerColor = Palette.surface) {
                AppState.Tab.entries.forEach { tab ->
                    NavigationBarItem(
                        selected = app.tab == tab,
                        onClick = { app.tab = tab },
                        icon = { Icon(tab.icon, contentDescription = null) },
                        label = { Text(tab.label) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = Palette.blue, selectedTextColor = Palette.blue,
                            unselectedIconColor = Palette.muted, unselectedTextColor = Palette.muted,
                            indicatorColor = Palette.blue.copy(alpha = 0.12f),
                        ),
                    )
                }
            }
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when (app.tab) {
                AppState.Tab.Today -> TodayScreen(session, app)
                AppState.Tab.Assistant -> AssistantScreen(app)
                AppState.Tab.Tasks -> TasksScreen()
                AppState.Tab.Notes -> NotesScreen()
                AppState.Tab.More -> MoreScreen(session, app)
            }
        }
    }
}
