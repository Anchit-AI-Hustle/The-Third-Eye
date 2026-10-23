package com.thethirdeye.app

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CameraAlt
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LifecycleResumeEffect

private data class Permission(val key: String, val label: String, val icon: ImageVector, val manifest: String?)

private val permissions = listOf(
    Permission("mic", "Microphone", Icons.Outlined.Mic, Manifest.permission.RECORD_AUDIO),
    Permission("cam", "Camera", Icons.Outlined.CameraAlt, Manifest.permission.CAMERA),
    Permission("loc", "Location", Icons.Outlined.LocationOn, Manifest.permission.ACCESS_COARSE_LOCATION),
    Permission("notif", "Notifications", Icons.Outlined.Notifications, if (Build.VERSION.SDK_INT >= 33) Manifest.permission.POST_NOTIFICATIONS else null),
)

private fun Permission.granted(context: Context) =
    if (manifest != null) ContextCompat.checkSelfPermission(context, manifest) == PackageManager.PERMISSION_GRANTED
    else NotificationManagerCompat.from(context).areNotificationsEnabled()

private tailrec fun Context.activity(): Activity? = this as? Activity ?: (this as? ContextWrapper)?.baseContext?.activity()

/** The four permissions with their real status; a tap asks, or opens the system settings once Android won't ask again. */
@Composable
fun PermissionTiles() {
    val context = LocalContext.current
    val asked = remember { context.getSharedPreferences("permissions", Context.MODE_PRIVATE) }
    var tick by remember { mutableIntStateOf(0) }
    val request = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { tick++ }
    LifecycleResumeEffect(Unit) { tick++; onPauseOrDispose {} }

    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        permissions.chunked(2).forEach { pair ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                pair.forEach { p ->
                    val granted = remember(tick) { p.granted(context) }
                    Row(
                        Modifier.weight(1f).card {
                            val manifest = p.manifest
                            val activity = context.activity()
                            val blocked = manifest == null || (asked.getBoolean(p.key, false) && activity != null && !ActivityCompat.shouldShowRequestPermissionRationale(activity, manifest))
                            if (manifest == null || blocked) context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null)))
                            else { asked.edit().putBoolean(p.key, true).apply(); request.launch(manifest) }
                        },
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Icon(p.icon, null, tint = if (granted) Palette.success else Palette.muted)
                        Column {
                            Text(p.label, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                            Text(if (granted) "Allowed" else "Tap to allow", fontSize = 12.sp, color = if (granted) Palette.success else Palette.muted)
                        }
                    }
                }
            }
        }
    }
}

private fun statusColor(status: String): Color = when (status) {
    "live" -> Palette.success
    "partial" -> Palette.warning
    else -> Palette.muted
}

private fun requirementIcon(key: String): ImageVector? = when (key) {
    "mic" -> Icons.Outlined.Mic
    "cam" -> Icons.Outlined.CameraAlt
    "loc" -> Icons.Outlined.LocationOn
    "notif" -> Icons.Outlined.Notifications
    "key" -> Icons.Outlined.Key
    else -> null
}

@Composable
fun CapabilitiesScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    LaunchedEffect(Unit) { Catalog.load(context) }
    val catalog = Catalog.data

    ListScreen("Capabilities", catalog != null || Catalog.error != null, refresh = { Catalog.load(context, refresh = true) }, onBack = onBack) {
        item { ErrorText(Catalog.error) }
        if (catalog == null) return@ListScreen
        item("counts") {
            Panel {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                    listOf("live", "partial", "planned").forEach { status ->
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(catalog.capabilities.count { it.status == status }.toString(), fontSize = 26.sp, fontWeight = FontWeight.Bold, color = statusColor(status))
                            Text(status, fontSize = 12.sp, color = Palette.muted)
                        }
                    }
                }
            }
        }
        item { SectionLabel("Permissions") }
        item("permissions") { PermissionTiles() }
        catalog.capabilities.groupBy { it.group }.forEach { (group, caps) ->
            item("group-$group") { SectionLabel(group) }
            caps.forEach { cap ->
                item("${cap.group}-${cap.name}") {
                    Column(Modifier.card(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(cap.name, Modifier.weight(1f), fontSize = 15.sp, fontWeight = FontWeight.Medium)
                            if (cap.premium) Badge("Premium", Palette.blue)
                            Badge(cap.status, statusColor(cap.status))
                        }
                        Text(cap.blurb, fontSize = 12.sp, color = Palette.secondary)
                        if (cap.required.isNotEmpty()) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            cap.required.mapNotNull(::requirementIcon).forEach { Icon(it, null, Modifier.size(16.dp), tint = Palette.muted) }
                        }
                    }
                }
            }
        }
    }
}
