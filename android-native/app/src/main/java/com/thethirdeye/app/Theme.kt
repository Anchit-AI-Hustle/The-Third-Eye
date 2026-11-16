package com.thethirdeye.app

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// frontend/DESIGN.md tokens.
object Palette {
    val background = Color(0xFF050505)
    val surface = Color(0xFF07111F)
    val elevated = Color(0xFF0D1B30)
    val border = Color(0xFF0F2235)
    val blue = Color(0xFF4FC3F7)
    val violet = Color(0xFF7B5CF0)
    val secondary = Color(0xFFB0B8C8)
    val muted = Color(0xFF7F87A8)
    val red = Color(0xFFEF4444)
    val success = Color(0xFF10B981)
    val warning = Color(0xFFF59E0B)
}

@Composable
fun TheThirdEyeTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Palette.blue,
            onPrimary = Palette.background,
            secondary = Palette.violet,
            background = Palette.background,
            onBackground = Color.White,
            surface = Palette.surface,
            onSurface = Color.White,
            surfaceVariant = Palette.elevated,
            onSurfaceVariant = Palette.secondary,
            surfaceContainer = Palette.surface,
            surfaceContainerHigh = Palette.elevated,
            outline = Palette.border,
            error = Palette.red,
        ),
        content = content,
    )
}

// The landing page's look: near-black, scattered stars, a blue-violet glow.
@Composable
fun Starfield(modifier: Modifier = Modifier) {
    Canvas(modifier.fillMaxSize().background(Palette.background)) {
        drawRect(Brush.radialGradient(listOf(Palette.violet.copy(alpha = 0.22f), Palette.blue.copy(alpha = 0.06f), Color.Transparent), center = center, radius = 1100f))
        var seed = 7UL
        fun next(): Float {
            seed = seed * 6364136223846793005UL + 1442695040888963407UL
            return (seed shr 33).toLong().toFloat() / (1L shl 31).toFloat()
        }
        repeat((size.width * size.height / 7000f).toInt()) {
            val r = 1f + next() * 2.5f
            val at = Offset(next() * size.width, next() * size.height)
            val color = if (next() < 0.7f) Palette.blue else Color(0xFFB3C7FF)
            drawCircle(color.copy(alpha = 0.2f + next() * 0.5f), r, at)
        }
    }
}

/** A screen on the starfield. */
@Composable
fun Backdrop(modifier: Modifier = Modifier, content: @Composable BoxScope.() -> Unit) {
    // Text on the starfield is white unless it says otherwise.
    CompositionLocalProvider(LocalContentColor provides Color.White) {
        Box(modifier.fillMaxSize()) {
            Starfield()
            content()
        }
    }
}

@Composable
fun GlowButton(text: String, enabled: Boolean = true, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.fillMaxWidth().heightIn(min = 50.dp),
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Palette.blue, contentColor = Palette.background),
    ) { Text(text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold) }
}

@Composable
fun StatusPill(text: String) {
    Row(
        Modifier
            .background(Palette.blue.copy(alpha = 0.1f), CircleShape)
            .border(1.dp, Palette.blue.copy(alpha = 0.3f), CircleShape)
            .padding(horizontal = 12.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(Modifier.size(6.dp).background(Palette.blue, CircleShape))
        Text(text.uppercase(), color = Palette.blue, fontSize = 11.sp, fontFamily = FontFamily.Monospace, letterSpacing = 2.sp)
    }
}

/** A rounded surface panel, the app's card. */
@Composable
fun Panel(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier
            .fillMaxWidth()
            .background(Palette.surface.copy(alpha = 0.8f), RoundedCornerShape(16.dp))
            .border(1.dp, Palette.border, RoundedCornerShape(16.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        content = content,
    )
}

@Composable
fun SectionLabel(text: String, color: Color = Palette.blue) {
    Text(text.uppercase(), color = color, fontSize = 11.sp, fontFamily = FontFamily.Monospace, letterSpacing = 1.5.sp, fontWeight = FontWeight.Medium)
}

@Composable
fun ErrorText(text: String?) {
    if (text != null) Text(text, color = Palette.red, fontSize = 13.sp)
}

@Composable
fun Hint(text: String) {
    Text(text, color = Palette.muted, fontSize = 14.sp)
}

/** Reloads when any row is saved or deleted, here or by the assistant. */
@Composable
fun ReloadOnDataChange(load: suspend () -> Unit) {
    LaunchedEffect(Unit) { Events.dataChanged.collect { load() } }
}
