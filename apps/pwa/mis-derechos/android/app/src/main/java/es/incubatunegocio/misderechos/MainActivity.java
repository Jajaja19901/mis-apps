package es.incubatunegocio.misderechos;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/**
 * Envoltorio nativo AUTO-ACTUALIZABLE de la PWA "Mis Derechos ante el Sistema".
 *
 * De dónde sale la app, por orden:
 *   1. La última versión DESCARGADA de GitHub (guardada en el propio móvil).
 *   2. Si nunca se descargó nada: la copia EMBEBIDA en el APK (funciona recién instalada y sin red).
 * En cada arranque, en segundo plano, se baja la última versión del repositorio;
 * si cambió, queda guardada y la siguiente apertura ya la usa. El APK solo se
 * reinstala si cambia este envoltorio nativo, no la app web.
 *
 * El origen es SIEMPRE https://appassets.androidplatform.net (fijo), así el
 * localStorage (keys de IA, leads, fotos del admin) sobrevive a todas las
 * actualizaciones, vengan de donde vengan.
 */
public class MainActivity extends Activity {

    private static final String ORIGEN_LOCAL = "appassets.androidplatform.net";
    private static final String URL_GIT = "https://raw.githubusercontent.com/Jajaja19901/mis-apps/claude/app-prompt-political-correctness-232l69/apps/pwa/mis-derechos/index.html";
    private static final String FICHERO_COPIA = "index-descargado.html";
    private static final int TAMANO_MINIMO = 100000; // la app real pesa ~800 KB: menos = error, no guardar
    private static final int PEDIR_FICHERO = 1;

    private WebView web;
    private ValueCallback<Uri[]> ficheroPendiente;

    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        web = new WebView(this);
        setContentView(web);

        WebSettings ajustes = web.getSettings();
        ajustes.setJavaScriptEnabled(true);
        ajustes.setDomStorageEnabled(true); // localStorage: keys de IA, leads, fotos del admin

        final WebViewAssetLoader cargador = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                return cargador.shouldInterceptRequest(r.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri destino = r.getUrl();
                if (ORIGEN_LOCAL.equals(destino.getHost())) return false; // navegación interna
                // WhatsApp, tel:, mailto:, enlaces al BOE... → aplicación del sistema
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, destino));
                } catch (Exception ignorada) { /* sin app para abrirlo: no romper */ }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (ficheroPendiente != null) ficheroPendiente.onReceiveValue(null);
                ficheroPendiente = callback; // subida de logo/fotos desde el panel de admin
                try {
                    startActivityForResult(params.createIntent(), PEDIR_FICHERO);
                } catch (Exception e) {
                    ficheroPendiente = null;
                    return false;
                }
                return true;
            }
        });

        cargarMejorCopia();
        descargarUltimaVersion();
    }

    /** Pinta la mejor copia disponible: la descargada de GitHub o, si no hay, la embebida. */
    private void cargarMejorCopia() {
        String html = null;
        File copia = new File(getFilesDir(), FICHERO_COPIA);
        if (copia.exists() && copia.length() >= TAMANO_MINIMO) {
            try {
                html = new String(leerBytes(copia), StandardCharsets.UTF_8);
            } catch (IOException ignorada) { /* copia ilegible: usar la embebida */ }
        }
        if (html != null) {
            // Base = el MISMO origen de siempre: localStorage intacto y rutas relativas servidas del APK
            web.loadDataWithBaseURL("https://" + ORIGEN_LOCAL + "/assets/index.html",
                    html, "text/html", "utf-8", null);
        } else {
            web.loadUrl("https://" + ORIGEN_LOCAL + "/assets/index.html");
        }
    }

    /** En segundo plano: baja la última versión del repo y la deja lista para la PRÓXIMA apertura. */
    private void descargarUltimaVersion() {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    HttpURLConnection con = (HttpURLConnection) new URL(URL_GIT).openConnection();
                    con.setConnectTimeout(10000);
                    con.setReadTimeout(20000);
                    if (con.getResponseCode() != 200) return;
                    byte[] datos = leerTodo(con.getInputStream());
                    if (datos.length < TAMANO_MINIMO) return; // página de error: no pisar la buena
                    File destino = new File(getFilesDir(), FICHERO_COPIA);
                    if (destino.exists() && Arrays.equals(datos, leerBytes(destino))) return; // sin cambios
                    File temporal = new File(getFilesDir(), FICHERO_COPIA + ".tmp");
                    FileOutputStream salida = new FileOutputStream(temporal);
                    try {
                        salida.write(datos);
                    } finally {
                        salida.close();
                    }
                    if (!temporal.renameTo(destino)) temporal.delete();
                } catch (Exception ignorada) { /* sin red o GitHub caído: seguimos con la copia actual */ }
            }
        }).start();
    }

    private static byte[] leerTodo(InputStream entrada) throws IOException {
        ByteArrayOutputStream acumulado = new ByteArrayOutputStream();
        byte[] trozo = new byte[16384];
        int leidos;
        while ((leidos = entrada.read(trozo)) > 0) acumulado.write(trozo, 0, leidos);
        entrada.close();
        return acumulado.toByteArray();
    }

    private static byte[] leerBytes(File fichero) throws IOException {
        FileInputStream entrada = new FileInputStream(fichero);
        try {
            return leerTodo(entrada);
        } finally {
            try { entrada.close(); } catch (IOException ignorada) {}
        }
    }

    @Override
    protected void onActivityResult(int peticion, int resultado, Intent datos) {
        if (peticion == PEDIR_FICHERO && ficheroPendiente != null) {
            ficheroPendiente.onReceiveValue(
                    WebChromeClient.FileChooserParams.parseResult(resultado, datos));
            ficheroPendiente = null;
        } else {
            super.onActivityResult(peticion, resultado, datos);
        }
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); // el router por hash de la app
        else super.onBackPressed();
    }
}
