package com.jarvis.app;

import android.app.NotificationChannel;
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

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Native device control for JARVIS. Web APIs cover a lot; the LED torch,
 * stream volume, window brightness and vibrator still need the OS.
 *
 * Wi-Fi / Bluetooth radios cannot be toggled by a third-party app on modern
 * Android — we open the matching Settings pane instead of lying.
 */
@CapacitorPlugin(name = "DeviceControl")
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
}
