package com.jarvis.app;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.telephony.SmsManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.hardware.camera2.CameraManager;
import android.media.AudioManager;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.provider.Settings;
import android.view.WindowManager;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PermissionState;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;

/**
 * Native device control for JARVIS. Web APIs cover a lot; the LED torch,
 * stream volume, window brightness and vibrator still need the OS.
 *
 * Wi-Fi / Bluetooth radios cannot be toggled by a third-party app on modern
 * Android — we open the matching Settings pane instead of lying.
 *
 * SMS and calls go out over the phone's own network with no app opening,
 * after a one-time permission. An SMS resolves only once the network has
 * accepted every part, so "sent" is never claimed early.
 */
@CapacitorPlugin(
    name = "DeviceControl",
    permissions = {
        @Permission(alias = "sms", strings = { Manifest.permission.SEND_SMS }),
        @Permission(alias = "phone", strings = { Manifest.permission.CALL_PHONE }),
    }
)
public class DeviceControlPlugin extends Plugin {
    private static final String CHANNEL_ID = "jarvis_device";
    private boolean torchOn = false;

    @PluginMethod
    public void flashlight(PluginCall call) {
        Boolean on = call.getBoolean("on", true);
        try {
            CameraManager cm = (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
            if (cm == null) {
                call.reject("No camera manager");
                return;
            }
            String[] ids = cm.getCameraIdList();
            if (ids.length == 0) {
                call.reject("No camera");
                return;
            }
            cm.setTorchMode(ids[0], Boolean.TRUE.equals(on));
            torchOn = Boolean.TRUE.equals(on);
            JSObject ret = new JSObject();
            ret.put("ok", true);
            ret.put("on", torchOn);
            call.resolve(ret);
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("ok", false);
            ret.put("error", e.getMessage());
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void vibrate(PluginCall call) {
        int duration = call.getInt("duration", 400);
        try {
            Vibrator vib;
            if (Build.VERSION.SDK_INT >= 31) {
                VibratorManager vm = (VibratorManager) getContext().getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                vib = vm != null ? vm.getDefaultVibrator() : null;
            } else {
                vib = (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
            }
            if (vib == null) {
                call.reject("No vibrator");
                return;
            }
            if (Build.VERSION.SDK_INT >= 26) {
                vib.vibrate(VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                vib.vibrate(duration);
            }
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        int level = call.getInt("level", 50);
        try {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (am == null) {
                call.reject("No audio manager");
                return;
            }
            int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            int target = Math.round(max * (Math.max(0, Math.min(100, level)) / 100f));
            am.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0);
            JSObject ret = new JSObject();
            ret.put("ok", true);
            ret.put("level", level);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void setBrightness(PluginCall call) {
        int level = call.getInt("level", 70);
        final float brightness = Math.max(0.05f, Math.min(1f, level / 100f));
        getActivity().runOnUiThread(() -> {
            try {
                WindowManager.LayoutParams lp = getActivity().getWindow().getAttributes();
                lp.screenBrightness = brightness;
                getActivity().getWindow().setAttributes(lp);
                JSObject ret = new JSObject();
                ret.put("ok", true);
                ret.put("level", level);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        });
    }

    @PluginMethod
    public void notify(PluginCall call) {
        String title = call.getString("title", "JARVIS");
        String body = call.getString("body", "");
        try {
            NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) {
                call.reject("No notification manager");
                return;
            }
            if (Build.VERSION.SDK_INT >= 26) {
                NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "JARVIS", NotificationManager.IMPORTANCE_DEFAULT);
                nm.createNotificationChannel(ch);
            }
            NotificationCompat.Builder b = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
                .setSmallIcon(getContext().getApplicationInfo().icon)
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true);
            nm.notify((int) System.currentTimeMillis(), b.build());
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    // Google refuses sign-in inside a WebView, so sign-in (SignInClient opens
    // /api/app-signin) goes to the phone's browser, which hands a code back
    // through thethirdeye://auth for this app to claim.
    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        String path = url.getPath();
        if (!"/api/app-signin".equals(path) && !"/auth/handoff".equals(path)) return null;
        Intent intent = new Intent(Intent.ACTION_VIEW, url);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        return true;
    }

    // Life Log "always listen": the native recorder in ListenService.
    @PluginMethod
    public void startListening(PluginCall call) {
        try {
            Backend.remember(getContext(), getBridge().getServerUrl());
            ListenService.start(getContext());
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        ListenService.stop(getContext());
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void listeningStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("on", ListenService.wanted(getContext()));
        ret.put("running", ListenService.running);
        ret.put("lastChunkAt", ListenService.lastChunkAt);
        ret.put("error", ListenService.error);
        ret.put("whatsappAutoSend", WhatsAppSender.enabled(getContext()));
        call.resolve(ret);
    }

    // Opens the chat with the message typed; with WhatsApp auto-send turned on in
    // Accessibility, presses send and resolves sent=true only once it has.
    @PluginMethod
    public void sendWhatsApp(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !(url.startsWith("whatsapp:") || url.startsWith("https://wa.me/"))) {
            call.reject("A WhatsApp link is required");
            return;
        }
        WhatsAppSender.send(getContext(), url, sent -> {
            JSObject ret = new JSObject();
            ret.put("ok", true);
            ret.put("sent", sent);
            call.resolve(ret);
        });
    }

    // ---- Device control the person allows ---------------------------------
    // Each action needs its own grant; without it the matching Settings screen
    // opens and the result says so, so nothing is claimed that didn't happen.

    private JSObject needs(String what, String settingsAction) {
        Intent i = new Intent(settingsAction).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { getContext().startActivity(i); } catch (Exception ignored) { }
        JSObject ret = new JSObject();
        ret.put("ok", false);
        ret.put("needsPermission", what);
        return ret;
    }

    private static JSObject done(String applied) {
        JSObject ret = new JSObject();
        ret.put("ok", true);
        ret.put("applied", applied);
        return ret;
    }

    @PluginMethod
    public void openApp(PluginCall call) {
        String name = call.getString("name", "").trim().toLowerCase();
        if (name.isEmpty()) { call.resolve(failure("Which app?")); return; }
        android.content.pm.PackageManager pm = getContext().getPackageManager();
        Intent main = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        android.content.pm.ResolveInfo best = null;
        int bestScore = 0;
        for (android.content.pm.ResolveInfo ri : pm.queryIntentActivities(main, 0)) {
            String label = String.valueOf(ri.loadLabel(pm)).toLowerCase();
            int score = label.equals(name) ? 3 : label.startsWith(name) ? 2 : label.contains(name) ? 1 : 0;
            if (score > bestScore) { best = ri; bestScore = score; }
        }
        if (best == null) { call.resolve(failure("No app called \"" + name + "\" is installed.")); return; }
        Intent launch = pm.getLaunchIntentForPackage(best.activityInfo.packageName);
        if (launch == null) { call.resolve(failure("That app can't be opened directly.")); return; }
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(launch);
        call.resolve(done("Opened " + best.loadLabel(pm)));
    }

    @PluginMethod
    public void setAlarm(PluginCall call) {
        Integer hour = call.getInt("hour");
        Integer minute = call.getInt("minute", 0);
        if (hour == null || hour < 0 || hour > 23 || minute < 0 || minute > 59) { call.resolve(failure("What time?")); return; }
        Intent i = new Intent(android.provider.AlarmClock.ACTION_SET_ALARM)
            .putExtra(android.provider.AlarmClock.EXTRA_HOUR, hour)
            .putExtra(android.provider.AlarmClock.EXTRA_MINUTES, minute)
            .putExtra(android.provider.AlarmClock.EXTRA_MESSAGE, call.getString("label", "JARVIS"))
            .putExtra(android.provider.AlarmClock.EXTRA_SKIP_UI, true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(i);
            call.resolve(done(String.format(java.util.Locale.US, "Alarm set for %02d:%02d", hour, minute)));
        } catch (Exception e) {
            call.resolve(failure("No clock app here takes alarms."));
        }
    }

    @PluginMethod
    public void setTimer(PluginCall call) {
        Integer seconds = call.getInt("seconds");
        if (seconds == null || seconds < 1 || seconds > 86_400) { call.resolve(failure("How long?")); return; }
        Intent i = new Intent(android.provider.AlarmClock.ACTION_SET_TIMER)
            .putExtra(android.provider.AlarmClock.EXTRA_LENGTH, seconds)
            .putExtra(android.provider.AlarmClock.EXTRA_MESSAGE, call.getString("label", "JARVIS"))
            .putExtra(android.provider.AlarmClock.EXTRA_SKIP_UI, true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(i);
            call.resolve(done("Timer started"));
        } catch (Exception e) {
            call.resolve(failure("No clock app here takes timers."));
        }
    }

    @PluginMethod
    public void media(PluginCall call) {
        String key = call.getString("key", "toggle");
        int code;
        switch (key) {
            case "play": code = android.view.KeyEvent.KEYCODE_MEDIA_PLAY; break;
            case "pause": code = android.view.KeyEvent.KEYCODE_MEDIA_PAUSE; break;
            case "next": code = android.view.KeyEvent.KEYCODE_MEDIA_NEXT; break;
            case "previous": code = android.view.KeyEvent.KEYCODE_MEDIA_PREVIOUS; break;
            default: code = android.view.KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE;
        }
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (am == null) { call.resolve(failure("No audio service")); return; }
        am.dispatchMediaKeyEvent(new android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN, code));
        am.dispatchMediaKeyEvent(new android.view.KeyEvent(android.view.KeyEvent.ACTION_UP, code));
        call.resolve(done("Sent " + key + " to the music that's playing"));
    }

    @PluginMethod
    public void doNotDisturb(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", true));
        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) { call.resolve(failure("No notification service")); return; }
        if (!nm.isNotificationPolicyAccessGranted()) { call.resolve(needs("dnd", Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)); return; }
        nm.setInterruptionFilter(on ? NotificationManager.INTERRUPTION_FILTER_PRIORITY : NotificationManager.INTERRUPTION_FILTER_ALL);
        call.resolve(done(on ? "Do Not Disturb is on" : "Do Not Disturb is off"));
    }

    @PluginMethod
    public void ringer(PluginCall call) {
        String mode = call.getString("mode", "normal");
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (am == null || nm == null) { call.resolve(failure("No audio service")); return; }
        // Android counts silent and leaving silent as Do Not Disturb changes.
        if (!nm.isNotificationPolicyAccessGranted() && (mode.equals("silent") || am.getRingerMode() == AudioManager.RINGER_MODE_SILENT)) {
            call.resolve(needs("dnd", Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS));
            return;
        }
        int m = mode.equals("silent") ? AudioManager.RINGER_MODE_SILENT : mode.equals("vibrate") ? AudioManager.RINGER_MODE_VIBRATE : AudioManager.RINGER_MODE_NORMAL;
        am.setRingerMode(m);
        call.resolve(done("Ringer set to " + mode));
    }

    @PluginMethod
    public void systemAction(PluginCall call) {
        String action = call.getString("action", "");
        WhatsAppSender svc = WhatsAppSender.instance;
        if (svc == null) { call.resolve(needs("accessibility", Settings.ACTION_ACCESSIBILITY_SETTINGS)); return; }
        int g;
        switch (action) {
            case "lock": g = Build.VERSION.SDK_INT >= 28 ? android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_LOCK_SCREEN : -1; break;
            case "screenshot": g = Build.VERSION.SDK_INT >= 28 ? android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_TAKE_SCREENSHOT : -1; break;
            case "home": g = android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_HOME; break;
            case "back": g = android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK; break;
            case "recents": g = android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_RECENTS; break;
            case "notifications": g = android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS; break;
            case "quick_settings": g = android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_QUICK_SETTINGS; break;
            default: g = -1;
        }
        if (g < 0) { call.resolve(failure("This phone can't do \"" + action + "\".")); return; }
        call.resolve(svc.performGlobalAction(g) ? done("Done: " + action.replace('_', ' ')) : failure("The phone didn't accept that."));
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        String pane = call.getString("pane", "wifi");
        Intent intent;
        switch (pane) {
            case "bluetooth":
                intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
                break;
            case "airplane":
                intent = new Intent(Settings.ACTION_AIRPLANE_MODE_SETTINGS);
                break;
            case "accessibility":
                intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
                break;
            case "dnd":
                intent = new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS);
                break;
            case "location":
                intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
                break;
            case "battery":
                intent = new Intent(Intent.ACTION_POWER_USAGE_SUMMARY);
                break;
            case "display":
                intent = new Intent(Settings.ACTION_DISPLAY_SETTINGS);
                break;
            case "sound":
                intent = new Intent(Settings.ACTION_SOUND_SETTINGS);
                break;
            case "apps":
                intent = new Intent(Settings.ACTION_APPLICATION_SETTINGS);
                break;
            case "notifications":
                intent = Build.VERSION.SDK_INT >= 26
                    ? new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName())
                    : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
                break;
            case "internet":
                intent = Build.VERSION.SDK_INT >= 29 ? new Intent(Settings.Panel.ACTION_INTERNET_CONNECTIVITY) : new Intent(Settings.ACTION_WIFI_SETTINGS);
                break;
            case "wifi":
            default:
                intent = new Intent(Settings.ACTION_WIFI_SETTINGS);
                break;
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ok", true);
        ret.put("torchOn", torchOn);
        try {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                int cur = am.getStreamVolume(AudioManager.STREAM_MUSIC);
                ret.put("volumePercent", max == 0 ? 0 : Math.round(100f * cur / max));
            }
        } catch (Exception ignored) { }
        call.resolve(ret);
    }

    private static final String SMS_SENT = "com.jarvis.app.SMS_SENT";
    private static final long SMS_TIMEOUT_MS = 30_000;

    private static JSObject failure(String error) {
        JSObject ret = new JSObject();
        ret.put("ok", false);
        ret.put("error", error);
        return ret;
    }

    @PluginMethod
    public void sendSms(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            requestPermissionForAlias("sms", call, "smsPermission");
            return;
        }
        deliverSms(call);
    }

    @PermissionCallback
    private void smsPermission(PluginCall call) {
        if (getPermissionState("sms") == PermissionState.GRANTED) deliverSms(call);
        else call.resolve(failure("SMS permission was not granted"));
    }

    private void deliverSms(PluginCall call) {
        String to = call.getString("to", "");
        String message = call.getString("message", "");
        if (to.isEmpty() || message.isEmpty()) {
            call.resolve(failure("A number and a message are needed"));
            return;
        }
        try {
            Context ctx = getContext();
            SmsManager sms = Build.VERSION.SDK_INT >= 31 ? ctx.getSystemService(SmsManager.class) : SmsManager.getDefault();
            ArrayList<String> parts = sms.divideMessage(message);
            String action = SMS_SENT + "." + System.nanoTime();
            final int[] pending = { parts.size() };
            final boolean[] done = { false };
            Handler handler = new Handler(Looper.getMainLooper());
            BroadcastReceiver receiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context c, Intent intent) {
                    if (done[0]) return;
                    if (getResultCode() != Activity.RESULT_OK) {
                        finish(c, this, handler, done, call, failure("The network did not accept the SMS (code " + getResultCode() + ")"));
                    } else if (--pending[0] == 0) {
                        JSObject ret = new JSObject();
                        ret.put("ok", true);
                        finish(c, this, handler, done, call, ret);
                    }
                }
            };
            ContextCompat.registerReceiver(ctx, receiver, new IntentFilter(action), ContextCompat.RECEIVER_NOT_EXPORTED);
            handler.postDelayed(() -> finish(ctx, receiver, handler, done, call, failure("No confirmation from the network")), SMS_TIMEOUT_MS);
            ArrayList<PendingIntent> sent = new ArrayList<>();
            for (int i = 0; i < parts.size(); i++) {
                Intent intent = new Intent(action).setPackage(ctx.getPackageName());
                sent.add(PendingIntent.getBroadcast(ctx, i, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
            }
            sms.sendMultipartTextMessage(to, null, parts, sent, null);
        } catch (Exception e) {
            call.resolve(failure(e.getMessage()));
        }
    }

    private static void finish(Context ctx, BroadcastReceiver receiver, Handler handler, boolean[] done, PluginCall call, JSObject result) {
        if (done[0]) return;
        done[0] = true;
        handler.removeCallbacksAndMessages(null);
        try { ctx.unregisterReceiver(receiver); } catch (IllegalArgumentException ignored) { }
        call.resolve(result);
    }

    @PluginMethod
    public void call(PluginCall call) {
        if (getPermissionState("phone") != PermissionState.GRANTED) {
            requestPermissionForAlias("phone", call, "phonePermission");
            return;
        }
        placeCall(call);
    }

    @PermissionCallback
    private void phonePermission(PluginCall call) {
        if (getPermissionState("phone") == PermissionState.GRANTED) placeCall(call);
        else call.resolve(failure("Phone permission was not granted"));
    }

    private void placeCall(PluginCall call) {
        String number = call.getString("number", "");
        if (number.isEmpty()) {
            call.resolve(failure("A number is needed"));
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_CALL, Uri.parse("tel:" + Uri.encode(number)));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.resolve(failure(e.getMessage()));
        }
    }
}
