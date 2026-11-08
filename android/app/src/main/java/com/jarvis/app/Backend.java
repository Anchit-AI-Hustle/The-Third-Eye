package com.jarvis.app;

import android.content.Context;
import android.webkit.CookieManager;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

// Calls the site as the signed-in user from native code (the listening
// service), with the session cookie the app's web view already holds.
final class Backend {
    private static final String PREFS = "jarvis_backend";

    private Backend() {}

    static void remember(Context ctx, String server) {
        if (server != null) ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("server", server).apply();
    }

    static String server(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("server", "https://the-third-eye.anchit-tandon.com");
    }

    static String json(Context ctx, String method, String path, String body) throws Exception {
        HttpURLConnection c = open(ctx, method, path);
        if (body != null) {
            c.setRequestProperty("Content-Type", "application/json");
            c.setDoOutput(true);
            try (OutputStream out = c.getOutputStream()) { out.write(body.getBytes(StandardCharsets.UTF_8)); }
        }
        return read(c);
    }

    static String upload(Context ctx, String path, String field, File file, String name, String type) throws Exception {
        String boundary = "----jarvis" + System.nanoTime();
        HttpURLConnection c = open(ctx, "POST", path);
        c.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
        c.setDoOutput(true);
        try (OutputStream out = c.getOutputStream(); InputStream in = new FileInputStream(file)) {
            out.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + field + "\"; filename=\"" + name + "\"\r\nContent-Type: " + type + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
            byte[] buf = new byte[8192];
            for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            out.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
        }
        return read(c);
    }

    private static HttpURLConnection open(Context ctx, String method, String path) throws Exception {
        String server = server(ctx);
        HttpURLConnection c = (HttpURLConnection) new URL(server + path).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(15_000);
        c.setReadTimeout(60_000);
        String cookie = CookieManager.getInstance().getCookie(server);
        if (cookie != null) c.setRequestProperty("Cookie", cookie);
        return c;
    }

    private static String read(HttpURLConnection c) throws Exception {
        int code = c.getResponseCode();
        InputStream in = code < 400 ? c.getInputStream() : c.getErrorStream();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        if (in != null) try (InputStream s = in) {
            byte[] buf = new byte[8192];
            for (int n; (n = s.read(buf)) > 0; ) out.write(buf, 0, n);
        }
        c.disconnect();
        if (code >= 400) throw new Exception("HTTP " + code);
        return out.toString("UTF-8");
    }
}
