package com.thethirdeye.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.webkit.MimeTypeMap
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.automirrored.outlined.MenuBook
import androidx.compose.material.icons.outlined.AccountTree
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material.icons.outlined.Cable
import androidx.compose.material.icons.outlined.Diamond
import androidx.compose.material.icons.outlined.Gavel
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.MonitorHeart
import androidx.compose.material.icons.outlined.PanTool
import androidx.compose.material.icons.outlined.Policy
import androidx.compose.material.icons.outlined.RecordVoiceOver
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.TrackChanges
import androidx.compose.material.icons.outlined.ViewModule
import androidx.compose.material.icons.outlined.WorkOutline
import androidx.compose.material.icons.outlined.AutoFixHigh
import androidx.compose.material.icons.outlined.People
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat

// The website's More menu (frontend Sidebar MAIN_ITEMS + MORE_GROUPS), in the
// same groups and order. Every item is a native screen except the three legal
// pages, which open the website page inside the app, signed in, without the website's menus.
data class MenuItem(val title: String, val icon: ImageVector, val path: String)

val moreMenu: List<Pair<String, List<MenuItem>>> = listOf(
    "Workspace" to listOf(MenuItem("Knowledge", Icons.AutoMirrored.Outlined.MenuBook, "/knowledge")),
    "Personal" to listOf(
        MenuItem("Goals", Icons.Outlined.TrackChanges, "/goals"),
        MenuItem("Life Log", Icons.Outlined.RecordVoiceOver, "/lifelog"),
        MenuItem("Online Agents", Icons.Outlined.People, "/agents"),
        MenuItem("Generations", Icons.Outlined.History, "/generations"),
    ),
    "Create & Grow" to listOf(
        MenuItem("Studio", Icons.Outlined.AutoFixHigh, "/tools"),
        MenuItem("Skills", Icons.Outlined.AccountTree, "/skills"),
        MenuItem("Job Agent", Icons.Outlined.WorkOutline, "/job-agent"),
        MenuItem("Kolab", Icons.Outlined.Groups, "/kolab"),
    ),
    "Apps & Life" to listOf(
        MenuItem("Apps", Icons.Outlined.ViewModule, "/apps"),
        MenuItem("Finance", Icons.Outlined.BarChart, "/finance"),
    ),
    "Account & System" to listOf(
        MenuItem("Plans & Credits", Icons.Outlined.Diamond, "/plans"),
        MenuItem("Capabilities", Icons.Outlined.AutoAwesome, "/capabilities"),
        MenuItem("Agent Activity", Icons.Outlined.MonitorHeart, "/activity"),
        MenuItem("App Audit", Icons.Outlined.Shield, "/audit"),
        MenuItem("Connectors", Icons.Outlined.Cable, "/connectors"),
        MenuItem("Settings", Icons.Outlined.Settings, "/settings"),
    ),
    "About" to listOf(
        MenuItem("Privacy note", Icons.Outlined.PanTool, "/privacy"),
        MenuItem("Privacy Policy", Icons.Outlined.Policy, "/privacy_policy"),
        MenuItem("Terms of Service", Icons.Outlined.Gavel, "/terms_of_service"),
    ),
)

/** Where the More tab is: its menu, then whatever was opened from it. */
sealed interface Dest {
    data class Screen(val item: MenuItem) : Dest
    data class Web(val title: String, val path: String) : Dest
    data class Tool(val id: String) : Dest
    data class Document(val doc: KnowledgeDoc) : Dest
    data class Day(val day: LifeLogDay) : Dest
    data object Today : Dest
    data object KolabStudio : Dest
}

class Nav {
    val stack = mutableStateListOf<Dest>()
    fun push(d: Dest) { stack.add(d) }
    fun back() { stack.removeLastOrNull() }
}

@Composable
fun MoreScreen(session: Session, app: AppState, nav: Nav = remember { Nav() }) {
    val context = LocalContext.current
    BackHandler(nav.stack.isNotEmpty()) { nav.back() }
    when (val top = nav.stack.lastOrNull()) {
        null -> ListScreen("More", loaded = true, refresh = {}) {
            moreMenu.forEach { (group, items) ->
                item(group) { SectionLabel(group, Palette.muted) }
                items.forEach { item -> item(item.path) { MenuRow(item.title, item.icon) { nav.push(Dest.Screen(item)) } } }
            }
            item("signout") { MenuRow("Sign out", Icons.AutoMirrored.Outlined.Logout, Palette.red) { session.signOut() } }
        }
        is Dest.Screen -> when (top.item.path) {
            "/goals" -> GoalsScreen(nav::back)
            "/finance" -> FinanceScreen(nav::back)
            "/knowledge" -> KnowledgeScreen(app, nav)
            "/lifelog" -> LifeLogScreen(nav)
            "/activity" -> ActivityScreen(nav::back)
            "/connectors" -> ConnectorsScreen(nav::back)
            "/tools" -> StudioScreen(app, nav)
            "/generations" -> GenerationsScreen(nav::back)
            "/skills" -> SkillsScreen(app, nav::back)
            "/apps" -> AppsScreen(app, nav)
            "/plans" -> PlansScreen(nav::back)
            "/capabilities" -> CapabilitiesScreen(nav::back)
            "/agents" -> AgentsScreen(app, nav)
            "/audit" -> AuditScreen(app, nav)
            "/kolab" -> KolabScreen(nav)
            "/job-agent" -> JobAgentScreen(session, nav)
            "/settings" -> SettingsScreen(session, nav)
            else -> WebScreen(top.item.title, top.item.path, nav::back)
        }
        is Dest.Web -> WebScreen(top.title, top.path, nav::back)
        is Dest.Tool -> when (top.id) {
            "music" -> MusicScreen(nav::back)
            "health" -> HealthScreen(nav::back)
            "anchor" -> AnchorScreen(nav::back)
            else -> ToolScreen(top.id, nav::back)
        }
        is Dest.Document -> DocumentScreen(top.doc, nav::back)
        is Dest.Day -> LifeLogDayScreen(top.day, nav::back)
        Dest.Today -> LifeLogTodayScreen(nav::back)
        Dest.KolabStudio -> KolabStudioScreen(nav)
    }
}

@Composable
private fun MenuRow(title: String, icon: ImageVector, tint: androidx.compose.ui.graphics.Color = Palette.blue, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().background(Palette.surface.copy(alpha = 0.7f), RoundedCornerShape(12.dp)).clickable(onClick = onClick).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Icon(icon, contentDescription = null, tint = tint)
        Text(title, fontSize = 16.sp)
    }
}

/** A website page inside the app: signed in (shared cookies), loading and error states, uploads, the mic, and other sites in the browser. */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun WebScreen(title: String, path: String, onBack: () -> Unit) {
    val context = LocalContext.current
    var loading by remember { mutableStateOf(true) }
    var failed by remember { mutableStateOf(false) }
    var pendingFiles by remember { mutableStateOf<ValueCallback<Array<Uri>>?>(null) }
    var pendingMic by remember { mutableStateOf<PermissionRequest?>(null) }
    var view by remember { mutableStateOf<WebView?>(null) }

    val pickFiles = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        pendingFiles?.onReceiveValue(uris.toTypedArray())
        pendingFiles = null
    }
    val askMic = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        pendingMic?.let { if (granted) it.grant(it.resources) else it.deny() }
        pendingMic = null
    }

    BackHandler { if (view?.canGoBack() == true) view?.goBack() else onBack() }
    DisposableEffect(Unit) { onDispose { view?.apply { stopLoading(); destroy() }; view = null } }

    TitledScreen(title, onBack) { padding ->
            Box(Modifier.fillMaxSize().padding(padding)) {
                AndroidView(
                    modifier = Modifier.fillMaxSize(),
                    factory = { ctx ->
                        WebView(ctx).apply {
                            setBackgroundColor(0xFF050505.toInt())
                            settings.javaScriptEnabled = true
                            settings.domStorageEnabled = true
                            settings.mediaPlaybackRequiresUserGesture = false
                            // The website hides its own menus for this user agent (MainLayout).
                            settings.userAgentString = settings.userAgentString + " TheThirdEyeApp/2"
                            webViewClient = object : WebViewClient() {
                                override fun onPageStarted(v: WebView, url: String?, favicon: Bitmap?) { loading = true; failed = false }
                                override fun onPageFinished(v: WebView, url: String?) { loading = false }
                                override fun onReceivedError(v: WebView, request: WebResourceRequest, error: WebResourceError) {
                                    if (request.isForMainFrame) { loading = false; failed = true }
                                }
                                // A crashed page must not take the app down with it.
                                override fun onRenderProcessGone(v: WebView, detail: RenderProcessGoneDetail): Boolean {
                                    view = null
                                    v.destroy()
                                    loading = false
                                    failed = true
                                    return true
                                }
                                override fun shouldOverrideUrlLoading(v: WebView, request: WebResourceRequest): Boolean {
                                    val url = request.url
                                    val ours = url.host == Uri.parse(BASE_URL).host
                                    if (ours && (url.scheme == "https" || url.scheme == "http")) return false
                                    runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, url)) }
                                    return true
                                }
                            }
                            webChromeClient = object : WebChromeClient() {
                                override fun onShowFileChooser(v: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                                    pendingFiles?.onReceiveValue(null)
                                    pendingFiles = callback
                                    pickFiles.launch(mimeTypes(params.acceptTypes))
                                    return true
                                }
                                override fun onPermissionRequest(request: PermissionRequest) {
                                    val ours = request.origin.host == Uri.parse(BASE_URL).host
                                    if (!ours || PermissionRequest.RESOURCE_AUDIO_CAPTURE !in request.resources) return request.deny()
                                    if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                                        request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                                    } else {
                                        pendingMic = request
                                        askMic.launch(Manifest.permission.RECORD_AUDIO)
                                    }
                                }
                            }
                            // Generated files open in the browser, which can save them.
                            setDownloadListener { url, _, _, _, _ ->
                                if (url.startsWith("http")) runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                            }
                            loadUrl(Api.url(path))
                            view = this
                        }
                    },
                )
                if (failed) Text(
                    "Couldn't load this page. Check your connection, then tap to try again.",
                    Modifier.align(Alignment.Center).clickable { view?.reload() }.padding(24.dp), color = Palette.secondary, textAlign = TextAlign.Center,
                ) else if (loading) CircularProgressIndicator(Modifier.align(Alignment.Center), color = Palette.blue)
            }
    }
}

// An <input accept> list (image types, ".pdf") as the MIME types the system picker filters by.
fun mimeTypes(accept: Array<String>): Array<String> {
    val types = accept.flatMap { it.split(",") }.map { it.trim().lowercase() }.filter { it.isNotEmpty() }.mapNotNull {
        if (it.startsWith(".")) MimeTypeMap.getSingleton().getMimeTypeFromExtension(it.drop(1)) else it
    }.distinct()
    return if (types.isEmpty()) arrayOf("*/*") else types.toTypedArray()
}
