package com.bastionbarons.game;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Vibrator;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;

// Abre o jogo (HTML5 em assets/) em tela cheia numa WebView.
public class MainActivity extends Activity {
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        Window w = getWindow();
        w.setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        useDisplayCutout(w);

        web = new WebView(this);
        web.setBackgroundColor(0xFF0B1230);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
        hideSystemUI();
        registerBackCallback();
    }

    // Android 13+: o botão/gesto Voltar chega por OnBackInvokedCallback (no Android 16 o onBackPressed
    // deixa de ser chamado). Registrado por reflexão para continuar compilando com o SDK antigo.
    private void registerBackCallback() {
        if (Build.VERSION.SDK_INT < 33) return;
        try {
            Object dispatcher = getClass().getMethod("getOnBackInvokedDispatcher").invoke(this);
            final Class<?> cb = Class.forName("android.window.OnBackInvokedCallback");
            Object callback = Proxy.newProxyInstance(cb.getClassLoader(), new Class<?>[]{cb}, new InvocationHandler() {
                @Override
                public Object invoke(Object proxy, Method m, Object[] args) {
                    if ("onBackInvoked".equals(m.getName())) goBack();
                    else if ("hashCode".equals(m.getName())) return System.identityHashCode(proxy);
                    else if ("equals".equals(m.getName())) return proxy == args[0];
                    else if ("toString".equals(m.getName())) return "BackCallback";
                    return null;
                }
            });
            dispatcher.getClass().getMethod("registerOnBackInvokedCallback", int.class, cb).invoke(dispatcher, 0, callback);
        } catch (Exception ignored) {
        }
    }

    private void goBack() {
        web.evaluateJavascript("window.BB && BB.ui && BB.ui.onBack()", null);
    }

    // Usa a área do entalhe da câmera (API 28+), via reflexão para compilar com SDK antigo
    private void useDisplayCutout(Window w) {
        if (Build.VERSION.SDK_INT < 28) return;
        try {
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.getClass().getField("layoutInDisplayCutoutMode").setInt(lp, 1);
            w.setAttributes(lp);
        } catch (Exception ignored) {
        }
    }

    @SuppressWarnings("deprecation")
    private void hideSystemUI() {
        web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUI();
    }

    @Override
    public void onBackPressed() {
        goBack();
    }

    @Override
    protected void onPause() {
        web.evaluateJavascript("window.BB && BB.onAppPause && BB.onAppPause()", null);
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        web.evaluateJavascript("window.BB && BB.onAppResume && BB.onAppResume()", null);
        hideSystemUI();
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }

    // Funções nativas chamadas pelo JavaScript
    private class Bridge {
        @JavascriptInterface
        @SuppressWarnings("deprecation")
        public void vibrate(int ms) {
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) v.vibrate(ms);
        }

        @JavascriptInterface
        public void openUrl(final String url) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                    } catch (Exception ignored) {
                    }
                }
            });
        }

        @JavascriptInterface
        public void exit() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    finish();
                }
            });
        }
    }
}
