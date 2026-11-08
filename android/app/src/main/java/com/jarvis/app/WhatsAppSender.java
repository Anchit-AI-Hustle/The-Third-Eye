package com.jarvis.app;

import android.accessibilityservice.AccessibilityService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.TextUtils;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import java.util.List;

// The Third Eye's accessibility switch. WhatsApp lets no app send for the
// person, but this service, once they turn it on, presses WhatsApp's own send
// button, only on a chat this app opened in the last few seconds with a
// message already typed, and reports whether it really did. It also performs
// system actions the assistant is asked for: lock screen, home, back, recents,
// notifications, quick settings and screenshot.
public class WhatsAppSender extends AccessibilityService {
    interface Result { void done(boolean sent); }

    private static final long WINDOW_MS = 20_000;
    private static final String[] SEND_IDS = { "com.whatsapp:id/send", "com.whatsapp.w4b:id/send" };
    private static volatile long armedUntil = 0;
    private static volatile Result pending;
    private static final Handler main = new Handler(Looper.getMainLooper());
    // The running service, for system actions (lock screen, home, screenshot)
    // the person allowed by turning it on.
    static volatile WhatsAppSender instance;

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
    }

    @Override
    public boolean onUnbind(Intent intent) {
        instance = null;
        return super.onUnbind(intent);
    }

    static boolean enabled(Context ctx) {
        String on = Settings.Secure.getString(ctx.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (TextUtils.isEmpty(on)) return false;
        String me = new ComponentName(ctx, WhatsAppSender.class).flattenToString();
        for (String s : on.split(":")) if (s.equalsIgnoreCase(me)) return true;
        return false;
    }

    // Opens the chat with the text typed and, when the service is on, presses send.
    static void send(Context ctx, String url, Result result) {
        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (!enabled(ctx)) {
            ctx.startActivity(open);
            result.done(false);
            return;
        }
        finish(false);
        pending = result;
        armedUntil = System.currentTimeMillis() + WINDOW_MS;
        main.postDelayed(() -> { if (System.currentTimeMillis() >= armedUntil) finish(false); }, WINDOW_MS + 500);
        ctx.startActivity(open);
    }

    private static void finish(boolean sent) {
        armedUntil = 0;
        Result r = pending;
        pending = null;
        if (r != null) r.done(sent);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (System.currentTimeMillis() > armedUntil) return;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return;
        for (String id : SEND_IDS) {
            List<AccessibilityNodeInfo> found = root.findAccessibilityNodeInfosByViewId(id);
            for (AccessibilityNodeInfo n : found) {
                if (n.isEnabled() && n.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                    finish(true);
                    return;
                }
            }
        }
    }

    @Override
    public void onInterrupt() {}
}
