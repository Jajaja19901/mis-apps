package com.incuba.vigia;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.app.ActivityCompat;

/**
 * VIGÍA IA — envoltorio WebView. Carga la app publicada en GitHub Pages, así el
 * APK no hay que recompilarlo cada vez: cualquier mejora de la app llega sola.
 * Concede a la web los permisos de cámara/micrófono (getUserMedia) para que la
 * detección funcione igual que en el navegador, e implementa el SELECTOR DE
 * ARCHIVOS (sin esto, «subir un vídeo de la galería» no hace nada en WebView).
 */
public class MainActivity extends Activity {

  private static final String URL_APP = "https://jajaja19901.github.io/mis-apps/";
  private static final int REQ_ARCHIVO = 2;
  private WebView web;
  private ValueCallback<Uri[]> archivoCallback;   // espera del selector de archivos

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

      // SELECTOR DE ARCHIVOS: imprescindible para <input type="file"> (subir
      // un vídeo de la galería para probar la IA). Sin esto, el toque en
      // «elegir archivo» se pierde en silencio dentro del WebView.
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
