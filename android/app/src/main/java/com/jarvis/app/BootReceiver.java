package com.jarvis.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;

// Listening switched on survives a restart of the phone. Android 11+ lets a
// microphone service started at boot record only silence, so there one tap on
// a notification resumes it; older versions restart it outright.
public class BootReceiver extends BroadcastReceiver {
    private static final String CHANNEL = "jarvis_resume";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction()) || !ListenService.wanted(ctx)) return;
        if (Build.VERSION.SDK_INT < 30) { ListenService.resume(ctx); return; }
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Resume listening", NotificationManager.IMPORTANCE_HIGH));
        PendingIntent open = PendingIntent.getActivity(ctx, 2, new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        nm.notify(4244, new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(ctx.getApplicationInfo().icon)
            .setContentTitle("Tap to resume listening")
            .setContentText("Your phone restarted. JARVIS starts listening again as soon as you open it.")
            .setContentIntent(open)
            .setAutoCancel(true)
            .build());
    }
}
