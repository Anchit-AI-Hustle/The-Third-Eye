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
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.audiofx.AcousticEchoCanceler;
import android.media.audiofx.AutomaticGainControl;
import android.media.audiofx.NoiseSuppressor;
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

import java.io.ByteArrayOutputStream;
import java.util.ArrayDeque;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

// The Life Log's "always listen" and the "Hey JARVIS" wake word on Android.
// Reads the mic itself (not through the web view), so both keep going with
// the screen off and after the app is swiped away, until turned off. The day
// is logged in 45-second chunks; the wake word is spotted on the device.
// Each chunk is transcribed and filed on the server, which turns the day into
// a timeline and its follow-ups into tasks and reminders. While it runs it also
// picks up what the person asked for on their computer (WhatsApp, SMS, calls).
public class ListenService extends Service {
    static final String STOP = "com.jarvis.app.STOP_LISTENING";
    static final String WAKE = "com.jarvis.app.WAKE";
    private static final String CHANNEL = "jarvis_listening";
    private static final String PREFS = "jarvis_listening";
    private static final String WAKE_CHANNEL = "jarvis_wake";
    private static final int ID = 4242;
    private static final int WAKE_ID = 4243;
    private static final int RATE = 16_000;
    // After a wake the conversation has the mic; a second wake right away is the reply echoing.
    private static final long WAKE_COOLDOWN_MS = 8_000;
    private static final long CHUNK_MS = 45_000;
    private static final long HANDOFF_MS = 15_000;
    // The website's silence threshold (0.012 of full scale) on the 0..32767 sample range.
    private static final int SILENT_PEAK = 393;

    static volatile boolean running = false;
    static volatile long lastChunkAt = 0;
    static volatile String error = null;
    static volatile boolean wakeReady = false;

    private volatile boolean active = false;
    private PowerManager.WakeLock wake;
    private Thread recorder;
    private Thread handoff;
    private final ExecutorService uploads = Executors.newSingleThreadExecutor();

    static void start(Context ctx) { set(ctx, "on", true); }

    static void stop(Context ctx) { set(ctx, "on", false); }

    static void startWake(Context ctx) { set(ctx, "wake", true); }

    /** Starts the service for whatever is already switched on. */
    static void resume(Context ctx) {
        Intent i = new Intent(ctx, ListenService.class);
        if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i); else ctx.startService(i);
    }

    static void stopWake(Context ctx) { set(ctx, "wake", false); }

    private static void set(Context ctx, String key, boolean value) {
        ctx.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(key, value).apply();
        if (wanted(ctx)) resume(ctx); else ctx.stopService(new Intent(ctx, ListenService.class));
    }

    static boolean logging(Context ctx) {
        return ctx.getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean("on", false);
    }

    static boolean waking(Context ctx) {
        return ctx.getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean("wake", false);
    }

    static boolean wanted(Context ctx) {
        return logging(ctx) || waking(ctx);
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
            .setContentTitle(logging(this) ? "JARVIS is listening" : "Say \"Hey JARVIS\"")
            .setContentText(logging(this) ? "Logging your day. Tap to turn listening off." : "Listening for its name only, on this phone. Tap to turn off.")
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
            if (listen()) backoff = 2_000;
            else { nap(backoff); backoff = Math.min(backoff * 2, 30_000); }
        }
    }

    // Reads the mic until stopped; false when it couldn't be opened (another app holds it), to retry.
    private boolean listen() {
        int min = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        AudioRecord rec;
        NoiseSuppressor noiseSuppressor = null;
        AutomaticGainControl gainControl = null;
        AcousticEchoCanceler echoCanceler = null;
        try {
            rec = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, Math.max(min, RATE));
            if (rec.getState() != AudioRecord.STATE_INITIALIZED) { rec.release(); throw new IllegalStateException(); }
            if (NoiseSuppressor.isAvailable()) noiseSuppressor = NoiseSuppressor.create(rec.getAudioSessionId());
            if (AutomaticGainControl.isAvailable()) gainControl = AutomaticGainControl.create(rec.getAudioSessionId());
            if (AcousticEchoCanceler.isAvailable()) echoCanceler = AcousticEchoCanceler.create(rec.getAudioSessionId());
            rec.startRecording();
        } catch (Exception e) {
            error = "The microphone isn't available right now. Retrying…";
            return false;
        }
        error = null;
        WakeWord wake = null;
        long wokeAt = 0;
        short[] buf = new short[RATE / 10];
        ByteArrayOutputStream chunk = new ByteArrayOutputStream();
        ArrayDeque<byte[]> preRoll = new ArrayDeque<>();
        long start = System.currentTimeMillis();
        int voiceFrames = 0;
        int quietFrames = 0;
        boolean speechOpen = false;
        try {
            while (active) {
                int n = rec.read(buf, 0, buf.length);
                if (n <= 0) { if (n < 0) break; continue; }
                if (waking(this)) {
                    // Opened here, off the main thread: the first time downloads the model.
                    if (wake == null) { wake = WakeWord.open(this); wakeReady = wake != null; }
                    if (wake != null && wake.feed(buf, n) && System.currentTimeMillis() - wokeAt > WAKE_COOLDOWN_MS) { wokeAt = System.currentTimeMillis(); woke(); }
                }
                if (!logging(this)) { chunk.reset(); preRoll.clear(); start = System.currentTimeMillis(); voiceFrames = 0; quietFrames = 0; speechOpen = false; continue; }
                ByteBuffer bytes = ByteBuffer.allocate(n * 2).order(ByteOrder.LITTLE_ENDIAN);
                for (int i = 0; i < n; i++) bytes.putShort(buf[i]);
                byte[] frame = bytes.array();
                preRoll.addLast(frame);
                while (preRoll.size() > 4) preRoll.removeFirst(); // 400 ms to preserve the first word
                if (speechLike(buf, n)) {
                    voiceFrames++;
                    quietFrames = 0;
                    if (!speechOpen && voiceFrames >= 2) {
                        speechOpen = true;
                        for (byte[] earlier : preRoll) chunk.write(earlier, 0, earlier.length);
                    } else if (speechOpen) chunk.write(frame, 0, frame.length);
                } else {
                    voiceFrames = 0;
                    if (speechOpen && ++quietFrames <= 8) chunk.write(frame, 0, frame.length); // 800 ms post-roll
                    if (quietFrames > 8) speechOpen = false;
                }
                long now = System.currentTimeMillis();
                if (now - start >= CHUNK_MS) {
                    byte[] pcm = chunk.toByteArray();
                    long from = start, to = now;
                    boolean silent = pcm.length < RATE * 2 / 3; // discard clips shorter than 330 ms of gated speech
                    uploads.execute(() -> deliver(pcm, from, to, silent));
                    chunk.reset();
                    preRoll.clear();
                    start = now;
                    voiceFrames = 0;
                    quietFrames = 0;
                    speechOpen = false;
                }
            }
        } finally {
            try { rec.stop(); } catch (Exception ignored) { /* already stopped */ }
            rec.release();
            if (noiseSuppressor != null) noiseSuppressor.release();
            if (gainControl != null) gainControl.release();
            if (echoCanceler != null) echoCanceler.release();
            if (wake != null) wake.close();
        }
        return true;
    }

    /** A lightweight speech gate: energy plus speech-like zero-crossing rate, after platform noise suppression. */
    private static boolean speechLike(short[] samples, int count) {
        if (count < 2) return false;
        long energy = 0;
        int crossings = 0;
        short previous = samples[0];
        for (int i = 0; i < count; i++) {
            int sample = samples[i];
            energy += (long) sample * sample;
            if ((sample < 0) != (previous < 0)) crossings++;
            previous = (short) sample;
        }
        double rms = Math.sqrt((double) energy / count);
        double crossingRate = (double) crossings / count;
        return rms >= 420 && crossingRate >= 0.015 && crossingRate <= 0.32;
    }

    // The name was heard: open the assistant in talk mode, over the lock screen if need be.
    private void woke() {
        Intent open = new Intent(this, MainActivity.class).setAction(WAKE)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(WAKE_CHANNEL, "Hey JARVIS", NotificationManager.IMPORTANCE_HIGH));
        }
        nm.notify(WAKE_ID, new NotificationCompat.Builder(this, WAKE_CHANNEL)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle("JARVIS")
            .setContentText("Listening… go ahead.")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setFullScreenIntent(pi, true)
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setTimeoutAfter(15_000)
            .build());
    }

    private static byte[] wav(byte[] pcm) {
        ByteBuffer h = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN);
        h.put("RIFF".getBytes()).putInt(36 + pcm.length).put("WAVE".getBytes())
            .put("fmt ".getBytes()).putInt(16).putShort((short) 1).putShort((short) 1)
            .putInt(RATE).putInt(RATE * 2).putShort((short) 2).putShort((short) 16)
            .put("data".getBytes()).putInt(pcm.length);
        byte[] out = new byte[44 + pcm.length];
        System.arraycopy(h.array(), 0, out, 0, 44);
        System.arraycopy(pcm, 0, out, 44, pcm.length);
        return out;
    }

    private void deliver(byte[] pcm, long start, long end, boolean silent) {
        File file = null;
        try {
            String transcript = "";
            String provider = null;
            if (!silent) {
                file = File.createTempFile("lifelog", ".wav", getCacheDir());
                try (FileOutputStream f = new FileOutputStream(file)) { f.write(wav(pcm)); }
                JSONObject t = new JSONObject(Backend.upload(this, "/api/transcribe", "audio", file, "chunk.wav", "audio/wav"));
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
            if (file != null) file.delete();
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
