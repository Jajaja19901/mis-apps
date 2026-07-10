package com.incuba.vigia;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.app.ActivityCompat;

/**
 * VIGÍA IA — envoltorio WebView. Carga la app publicada en GitHub Pages, así el
 * APK no hay que recompilarlo cada vez: cualquier mejora de la app llega sola.
 * Concede a la web los permisos de cámara/micrófono (getUserMedia) para que la
 * detección funcione igual que en el navegador.
 */
public class MainActivity extends Activity {

  private static final String URL_APP = "https://jajaja19901.github.io/mis-apps/";
  private WebView web;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    // Mantener la pantalla encendida mientras vigila (no se apaga sola).
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

    // Permisos del sistema (la web los volverá a pedir por su cuenta también).
    ActivityCompat.requestPermissions(this, new String[]{
        Manifest.permission.CAMERA,
        Manifest.permission.RECORD_AUDIO,
        Manifest.permission.ACCESS_FINE_LOCATION
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
    s.setCacheMode(WebSettings.LOAD_DEFAULT);

    web.setWebViewClient(new WebViewClient());
    web.setWebChromeClient(new WebChromeClient() {
      @Override
      public void onPermissionRequest(final PermissionRequest request) {
        runOnUiThread(new Runnable() {
          @Override public void run() { request.grant(request.getResources()); }
        });
      }
    });

    web.loadUrl(URL_APP);
    setContentView(web);
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
