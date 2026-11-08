package com.jarvis.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.media.MediaRecorder;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.telephony.SmsManager;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

// The Life Log's "always listen" on Android. Records the mic itself in
// 45-second chunks (not through the web view), so it keeps going with the
// screen off and after the app is swiped away, until the person turns it off.
// Each chunk is transcribed and filed on the server, which turns the day into
// a timeline and its follow-ups into tasks and reminders. While it runs it also
// picks up what the person asked for on their computer (WhatsApp, SMS, calls).
public class ListenService extends Service {
    static final String STOP = "com.jarvis.app.STOP_LISTENING";
    private static final String CHANNEL = "jarvis_listening";
    private static final String PREFS = "jarvis_listening";
    private static final int ID = 4242;
    private static final long CHUNK_MS = 45_000;
    private static final long HANDOFF_MS = 15_000;
    // The website's silence threshold (0.012 of full scale) on MediaRecorder's 0..32767 amplitude.
    private static final int SILENT_PEAK = 393;

    static volatile boolean running = false;
    static volatile long lastChunkAt = 0;
    static volatile String error = null;

    private volatile boolean active = false;
    private PowerManager.WakeLock wake;
    private Thread recorder;
    private Thread handoff;
    private final ExecutorService uploads = Executors.newSingleThreadExecutor();

    static void start(Context ctx) {
        ctx.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("on", true).apply();
        Intent i = new Intent(ctx, ListenService.class);
        if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i); else ctx.startService(i);
    }

    static void stop(Context ctx) {
        ctx.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("on", false).apply();
        ctx.stopService(new Intent(ctx, ListenService.class));
    }

    static boolean wanted(Context ctx) {
        return ctx.getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean("on", false);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!wanted(this)) { stopSelf(); return START_NOT_STICKY; }
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm != null) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Listening", NotificationManager.IMPORTANCE_LOW));
        }
        Intent stop = new Intent(this, MainActivity.class).setAction(STOP).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(this, 0, stop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle("JARVIS is listening")
            .setContentText("Logging your day. Tap to turn listening off.")
            .setContentIntent(tap)
            .addAction(0, "Turn off", tap)
            .setOngoing(true)
            .build();
        try {
            int type = Build.VERSION.SDK_INT >= 30 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE : 0;
            ServiceCompat.startForeground(this, ID, n, type);
        } catch (Exception e) {
            // Android refuses a microphone service started from the background
            // (e.g. after the system restarted it); the next app open resumes it.
            error = "Listening paused until you open the app again.";
            stopSelf();
            return START_NOT_STICKY;
        }
        if (wake == null) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "jarvis:listening");
            wake.acquire();
        }
        if (!active) {
            active = true;
            running = true;
            error = null;
            recorder = new Thread(this::recordLoop, "jarvis-listen");
            recorder.start();
            handoff = new Thread(this::handoffLoop, "jarvis-handoff");
            handoff.start();
        }
        return START_STICKY;
    }

    private void recordLoop() {
        long backoff = 2_000;
        while (active) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                error = "Microphone permission is off. Allow it for The Third Eye to keep listening.";
                nap(30_000);
                continue;
            }
            if (chunk()) backoff = 2_000;
            else { nap(backoff); backoff = Math.min(backoff * 2, 30_000); }
        }
    }

    // One chunk; false when the mic couldn't be opened (another app holds it), to retry.
    @SuppressWarnings("deprecation")
    private boolean chunk() {
        File file;
        MediaRecorder rec = Build.VERSION.SDK_INT >= 31 ? new MediaRecorder(this) : new MediaRecorder();
        try {
            file = File.createTempFile("lifelog", ".m4a", getCacheDir());
            rec.setAudioSource(MediaRecorder.AudioSource.MIC);
            rec.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            rec.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            rec.setAudioSamplingRate(16_000);
            rec.setAudioEncodingBitRate(32_000);
            rec.setAudioChannels(1);
            rec.setOutputFile(file.getAbsolutePath());
            rec.prepare();
            rec.start();
        } catch (Exception e) {
            rec.release();
            error = "The microphone isn't available right now. Retrying…";
            return false;
        }
        error = null;
        long start = System.currentTimeMillis();
        int peak = 0;
        while (active && System.currentTimeMillis() - start < CHUNK_MS) {
            nap(500);
            try { peak = Math.max(peak, rec.getMaxAmplitude()); } catch (Exception ignored) { break; }
        }
        try { rec.stop(); } catch (Exception ignored) { /* too short to keep */ }
        rec.release();
        long end = System.currentTimeMillis();
        boolean silent = peak < SILENT_PEAK || file.length() < 2000;
        uploads.execute(() -> deliver(file, start, end, silent));
        return true;
    }

    private void deliver(File file, long start, long end, boolean silent) {
        try {
            String transcript = "";
            String provider = null;
            if (!silent) {
                JSONObject t = new JSONObject(Backend.upload(this, "/api/transcribe", "audio", file, "chunk.m4a", "audio/mp4"));
                transcript = t.optString("text", "").trim();
                provider = t.optString("provider", null);
            }
            JSONObject seg = new JSONObject()
                .put("id", "a" + start).put("startTs", start).put("endTs", end)
                .put("transcript", transcript).put("silent", silent);
            if (provider != null) seg.put("provider", provider);
            // Minutes behind UTC, the same sign as the browser's getTimezoneOffset().
            int tz = -TimeZone.getDefault().getOffset(start) / 60_000;
            Backend.json(this, "POST", "/api/lifelog/segment", new JSONObject().put("segment", seg).put("tzOffset", tz).toString());
            lastChunkAt = end;
        } catch (Exception e) {
            error = "Couldn't reach the server for the last recording.";
        } finally {
            file.delete();
        }
    }

    // What the person asked for on another device, done from this phone.
    private void handoffLoop() {
        while (active) {
            nap(HANDOFF_MS);
            try {
                JSONArray items = new JSONObject(Backend.json(this, "GET", "/api/handoff", null)).optJSONArray("items");
                if (items == null) continue;
                for (int i = 0; i < items.length(); i++) act(items.getJSONObject(i));
            } catch (Exception ignored) { /* offline or signed out: next round */ }
        }
    }

    private void act(JSONObject item) throws Exception {
        String action = item.optString("action");
        String url = item.optString("native_url", "");
        if (url.isEmpty() || "null".equals(url)) url = item.optString("url");
        String id = item.optString("id");
        if ("whatsapp".equals(action) && WhatsAppSender.enabled(this)) {
            close(id, "opened");
            WhatsAppSender.send(this, url, sent -> notifyResult(sent ? "Sent on WhatsApp" : "WhatsApp is open", item.optString("label")));
        } else if ("sms".equals(action) && granted(Manifest.permission.SEND_SMS)) {
            Uri u = Uri.parse(url);
            String to = u.getSchemeSpecificPart().split("\\?")[0];
            String body = u.getQueryParameter("body");
            if (body == null) body = "";
            SmsManager sms = Build.VERSION.SDK_INT >= 31 ? getSystemService(SmsManager.class) : SmsManager.getDefault();
            sms.sendMultipartTextMessage(to, null, sms.divideMessage(body), null, null);
            close(id, "opened");
            notifyResult("Text sent", item.optString("label"));
        }
        // Calls, and WhatsApp without auto-send, wait for a tap in the app.
    }

    private boolean granted(String permission) {
        return ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED;
    }

    private void close(String id, String status) throws Exception {
        Backend.json(this, "PATCH", "/api/handoff", new JSONObject().put("id", id).put("status", status).toString());
    }

    private void notifyResult(String title, String body) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        nm.notify((int) System.currentTimeMillis(), new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(getApplicationInfo().icon).setContentTitle(title).setContentText(body).setAutoCancel(true).build());
    }

    private void nap(long ms) {
        try { Thread.sleep(ms); } catch (InterruptedException ignored) { /* stopping */ }
    }

    @Override
    public void onDestroy() {
        active = false;
        running = false;
        if (recorder != null) recorder.interrupt();
        if (handoff != null) handoff.interrupt();
        uploads.shutdown();
        if (wake != null && wake.isHeld()) wake.release();
        wake = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
