package com.jarvis.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DeviceControlPlugin.class);
        super.onCreate(savedInstanceState);
    }

    // BridgeActivity also calls this with the launch intent once the bridge exists.
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        openShared(intent);
    }

    // Text or a link shared from another app opens the assistant with it (the site's /share).
    private void openShared(Intent intent) {
        if (getBridge() == null || intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        String server = getBridge().getServerUrl();
        if (text == null || server == null) return;
        Uri.Builder url = Uri.parse(server).buildUpon().path("share").appendQueryParameter("text", text);
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        if (subject != null) url.appendQueryParameter("title", subject);
        WebView view = getBridge().getWebView();
        view.post(() -> view.loadUrl(url.toString()));
    }
}
