package com.incuba.leelabios;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.app.ActivityCompat;

/**
 * Lee Labios — envoltorio WebView. Carga la app que va DENTRO del propio APK
 * (assets/index.html), así funciona sin depender de ninguna web. La app es el
 * mando del motor de Colab: dentro se pega el enlace .gradio.live.
 * Concede a la web cámara/micrófono (grabar vídeo) e implementa el selector de
 * archivos (subir un vídeo de la galería).
 */
public class MainActivity extends Activity {

  private static final String URL_APP = "file:///android_asset/index.html";
  private static final int REQ_ARCHIVO = 2;
  private WebView web;
  private ValueCallback<Uri[]> archivoCallback;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    ActivityCompat.requestPermissions(this, new String[]{
        Manifest.permission.CAMERA,
        Manifest.permission.RECORD_AUDIO
    }, 1);

    web = new WebView(this);
    web.setLayoutParams(new ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setDatabaseEnabled(true);
    s.setMediaPlaybackRequiresUserGesture(false);
    s.setAllowFileAccess(true);
    s.setAllowContentAccess(true);
    s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
    s.setCacheMode(WebSettings.LOAD_DEFAULT);

    web.setWebViewClient(new WebViewClient());
    web.setWebChromeClient(new WebChromeClient() {
      @Override
      public void onPermissionRequest(final PermissionRequest request) {
        runOnUiThread(new Runnable() {
          @Override public void run() { request.grant(request.getResources()); }
        });
      }

      @Override
      public boolean onShowFileChooser(WebView vista, ValueCallback<Uri[]> callback,
                                       FileChooserParams params) {
        if (archivoCallback != null) archivoCallback.onReceiveValue(null);
        archivoCallback = callback;
        try {
          Intent intento = params.createIntent();
          startActivityForResult(intento, REQ_ARCHIVO);
        } catch (Exception e) {
          archivoCallback = null;
          return false;
        }
        return true;
      }
    });

    web.loadUrl(URL_APP);
    setContentView(web);
  }

  @Override
  protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    if (requestCode == REQ_ARCHIVO && archivoCallback != null) {
      archivoCallback.onReceiveValue(
          WebChromeClient.FileChooserParams.parseResult(resultCode, data));
      archivoCallback = null;
      return;
    }
    super.onActivityResult(requestCode, resultCode, data);
  }

  @Override
  public void onBackPressed() {
    if (web != null && web.canGoBack()) {
      web.goBack();
    } else {
      super.onBackPressed();
    }
  }
}
