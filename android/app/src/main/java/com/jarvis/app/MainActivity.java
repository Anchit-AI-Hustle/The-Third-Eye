package com.jarvis.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DeviceControlPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
