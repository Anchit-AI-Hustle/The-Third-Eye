package com.thethirdeye.app

import android.content.Context
import android.content.Intent
import android.net.Uri

sealed interface Route {
    data class Screen(val item: MenuItem) : Route
    data class Tool(val id: String) : Route
    data class Tab(val tab: AppState.Tab) : Route
    data class Web(val path: String) : Route
    data class Browser(val url: String) : Route
    data class Dial(val url: String) : Route
}

private val legalPaths = setOf("/privacy", "/privacy_policy", "/terms_of_service")

// Tools that need the browser's own tech (audio, camera, video, files).
val webTools = setOf("music", "health", "avatar", "video", "reel", "book", "anchor")

private val tabPaths = mapOf(
    "/assistant" to AppState.Tab.Assistant,
    "/tasks" to AppState.Tab.Tasks,
    "/notes" to AppState.Tab.Notes,
    "/today" to AppState.Tab.Today,
    "/dashboard" to AppState.Tab.Today,
)

/** Where an `href` from the catalog goes: a native screen if there is one, else the website inside the app, the browser or the dialer. */
fun routeOf(href: String, studioTools: Set<String>): Route {
    if (href.startsWith("tel:")) return Route.Dial(href)
    if (!href.startsWith("/")) return Route.Browser(href)
    val path = href.substringBefore('?').trimEnd('/')
    tabPaths[path]?.let { return Route.Tab(it) }
    moreMenu.flatMap { it.second }.firstOrNull { it.path == path && it.path !in legalPaths }?.let { return Route.Screen(it) }
    val tool = path.removePrefix("/tools/")
    if (path.startsWith("/tools/") && tool !in webTools && tool in studioTools) return Route.Tool(tool)
    return Route.Web(href)
}

private fun titleOf(path: String): String =
    moreMenu.flatMap { it.second }.firstOrNull { path.substringBefore('?') == it.path || path.startsWith(it.path + "/") }?.title ?: "The Third Eye"

fun Nav.open(href: String, app: AppState, context: Context) {
    when (val route = routeOf(href, Catalog.data?.studioTools.orEmpty().map { it.id }.toSet())) {
        is Route.Screen -> push(Dest.Screen(route.item))
        is Route.Tool -> push(Dest.Tool(route.id))
        is Route.Tab -> app.tab = route.tab
        is Route.Web -> push(Dest.Web(titleOf(route.path), route.path))
        is Route.Browser -> runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(route.url))) }
        is Route.Dial -> runCatching { context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse(route.url))) }
    }
}
