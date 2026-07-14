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

/**
 * Envoltorio nativo de la PWA "Mis Derechos ante el Sistema".
 * La web entera va EMBEBIDA en el APK (assets/) y se sirve desde un origen
 * seguro (https://appassets.androidplatform.net) para que localStorage y
 * fetch funcionen igual que en Netlify. Funciona sin conexión; solo la IA,
 * el BOE y las novedades necesitan internet (como en la web).
 */
public class MainActivity extends Activity {

    private static final String ORIGEN_LOCAL = "appassets.androidplatform.net";
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

        if (estado == null) {
            web.loadUrl("https://" + ORIGEN_LOCAL + "/assets/index.html");
        } else {
            web.restoreState(estado);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle fuera) {
        super.onSaveInstanceState(fuera);
        web.saveState(fuera);
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
