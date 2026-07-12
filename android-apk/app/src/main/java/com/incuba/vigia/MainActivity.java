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

    // 💾 PUENTE DE DESCARGA: el WebView no sabe descargar URLs blob: (los clips
    // grabados). La web llama a VigiaAndroid.guardarArchivo(base64, nombre, mime)
    // y aquí se escribe de verdad en la carpeta Descargas del teléfono.
    web.addJavascriptInterface(new PuenteVigia(), "VigiaAndroid");

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

  /** Puente JS→Android: guarda un archivo (base64) en Descargas del teléfono. */
  private class PuenteVigia {
    @android.webkit.JavascriptInterface
    public void guardarArchivo(String base64, String nombre, String mime) {
      try {
        final byte[] datos = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
        final String nom = (nombre == null || nombre.isEmpty()) ? "vigia.webm" : nombre;
        final String tipo = (mime == null || mime.isEmpty()) ? "video/webm" : mime;
        java.io.OutputStream os;
        if (android.os.Build.VERSION.SDK_INT >= 29) {
          // Android 10+: MediaStore → aparece en la app "Archivos/Descargas".
          android.content.ContentValues v = new android.content.ContentValues();
          v.put(android.provider.MediaStore.Downloads.DISPLAY_NAME, nom);
          v.put(android.provider.MediaStore.Downloads.MIME_TYPE, tipo);
          android.net.Uri uri = getContentResolver()
              .insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
          if (uri == null) throw new Exception("sin acceso a Descargas");
          os = getContentResolver().openOutputStream(uri);
        } else {
          // Android 7-9: carpeta pública de Descargas directamente.
          java.io.File dir = android.os.Environment
              .getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS);
          if (!dir.exists()) dir.mkdirs();
          os = new java.io.FileOutputStream(new java.io.File(dir, nom));
        }
        os.write(datos);
        os.close();
        runOnUiThread(new Runnable() {
          @Override public void run() {
            android.widget.Toast.makeText(MainActivity.this,
                "💾 Guardado en Descargas: " + nom, android.widget.Toast.LENGTH_LONG).show();
          }
        });
      } catch (final Exception e) {
        runOnUiThread(new Runnable() {
          @Override public void run() {
            android.widget.Toast.makeText(MainActivity.this,
                "No se pudo guardar: " + e.getMessage(), android.widget.Toast.LENGTH_LONG).show();
          }
        });
      }
    }
  }
}
