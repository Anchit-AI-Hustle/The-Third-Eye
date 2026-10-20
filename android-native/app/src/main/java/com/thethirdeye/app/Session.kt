package com.thethirdeye.app

import android.content.Context
import android.net.Uri
import android.webkit.CookieManager
import android.webkit.WebStorage
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import java.net.URLEncoder

// Sign-in: Google refuses sign-in inside an app's own web view, so it runs in a
// Custom Tab (the phone's browser, where a Google account may already be signed
// in). api/app-signin hands back a one-time code through thethirdeye://auth,
// which the app claims for its own session cookie at /api/auth/handoff.
class Session : ViewModel() {
    enum class State { Checking, SignedOut, SignedIn }

    var state by mutableStateOf(State.Checking)
    var busy by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)
    var name by mutableStateOf<String?>(null)

    private var prefs: android.content.SharedPreferences? = null

    fun start(context: Context) {
        prefs = context.getSharedPreferences("session", Context.MODE_PRIVATE)
        viewModelScope.launch { Events.sessionExpired.collect { expired(context) } }
        viewModelScope.launch { refresh() }
    }

    suspend fun refresh() {
        state = try {
            val user = json.parseToJsonElement(Api.backend.send("GET", "/api/auth/session")).jsonObject["user"]
            name = (user as? kotlinx.serialization.json.JsonObject)?.get("name")?.jsonPrimitive?.contentOrNull
            val signedIn = user is kotlinx.serialization.json.JsonObject
            prefs?.edit()?.putBoolean("was-signed-in", signedIn)?.apply()
            if (signedIn) State.SignedIn else State.SignedOut
        } catch (e: ApiError) {
            // Offline is not signed out: open the app and let each screen say it can't reach the server.
            if (e.status == 0 && prefs?.getBoolean("was-signed-in", false) == true) State.SignedIn else State.SignedOut
        }
    }

    fun signIn(context: Context) {
        error = null
        busy = true
        CustomTabsIntent.Builder()
            .setDefaultColorSchemeParams(CustomTabColorSchemeParams.Builder().setToolbarColor(0xFF050505.toInt()).build())
            .build()
            .launchUrl(context, Uri.parse(Api.url("/api/app-signin")))
    }

    /** thethirdeye://auth?code=… came back from the browser. */
    fun claim(code: String?) {
        viewModelScope.launch {
            busy = true
            try {
                if (code.isNullOrBlank()) { error = "Sign-in didn't finish. Try again."; return@launch }
                val reply = json.parseToJsonElement(Api.backend.send("GET", "/api/auth/handoff?code=${URLEncoder.encode(code, "UTF-8")}")).jsonObject
                if (reply["signedIn"]?.jsonPrimitive?.booleanOrNull == true) refresh() else error = "Sign-in expired. Try again."
            } catch (e: ApiError) {
                error = e.message
            } finally {
                busy = false
            }
        }
    }

    /** Back from the browser without a code (closed the tab). */
    fun returned() {
        busy = false
    }

    private fun expired(context: Context) {
        if (state != State.SignedIn) return
        signOut(context)
        error = "Your session ended. Sign in again to carry on."
    }

    /** Leaves nothing signed in behind: cookies (shared with the in-app web pages), their storage, the action log and scheduled reminders. */
    fun signOut(context: Context) {
        CookieManager.getInstance().removeAllCookies(null)
        CookieManager.getInstance().flush()
        WebStorage.getInstance().deleteAllData()
        AgentLog.get(context).clear()
        Reminders.clear(context)
        prefs?.edit()?.putBoolean("was-signed-in", false)?.apply()
        name = null
        state = State.SignedOut
    }
}

@Composable
fun SignInScreen(session: Session) {
    val context = LocalContext.current
    Backdrop {
        Column(
            Modifier.fillMaxSize().safeDrawingPadding().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(28.dp),
        ) {
            Spacer(Modifier.height(40.dp))
            Image(painterResource(R.drawable.launch_logo), contentDescription = "The Third Eye", modifier = Modifier.widthIn(max = 240.dp))
            StatusPill("Personal AI OS")
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Your assistant, always on call", fontSize = 28.sp, lineHeight = 34.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                Text("Talk or type. It knows your tasks, notes and files, and acts on them for you.", fontSize = 15.sp, color = Palette.secondary, textAlign = TextAlign.Center)
            }
            Column(
                Modifier.widthIn(max = 480.dp).fillMaxWidth()
                    .background(Palette.surface.copy(alpha = 0.6f), RoundedCornerShape(16.dp))
                    .border(1.dp, Palette.border, RoundedCornerShape(16.dp))
                    .padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                GlowButton(if (session.busy) "Signing in…" else "Continue with Google", enabled = !session.busy) { session.signIn(context) }
                ErrorText(session.error)
            }
            Text("Private by design. Your data stays in your own workspace.", fontSize = 12.sp, color = Palette.muted, textAlign = TextAlign.Center)
            Spacer(Modifier.height(24.dp))
        }
    }
}
