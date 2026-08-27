package es.incubatunegocio.anonimizador

import android.content.ContentValues
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import java.io.OutputStream

/** Envoltorio mínimo: toda la app vive en assets/www (HTML+JS) y corre en el WebView.
 *  El vídeo se procesa íntegramente en el dispositivo. */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private var eleccionFichero: ValueCallback<Array<Uri>>? = null

    private val selector = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        eleccionFichero?.onReceiveValue(if (uri != null) arrayOf(uri) else arrayOf())
        eleccionFichero = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        setContentView(web)

        val cargador = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = true
        }

        web.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val r = cargador.shouldInterceptRequest(request.url) ?: return null
                // MIME correcto para módulos ES y wasm (el adivinador de assets no los conoce)
                val ruta = request.url.path ?: ""
                when {
                    ruta.endsWith(".mjs") || ruta.endsWith(".js") -> r.mimeType = "text/javascript"
                    ruta.endsWith(".wasm") -> r.mimeType = "application/wasm"
                    ruta.endsWith(".onnx") -> r.mimeType = "application/octet-stream"
                }
                // COOP/COEP: activa crossOriginIsolated → SharedArrayBuffer → WASM multi-hilo
                val cab = HashMap(r.responseHeaders ?: emptyMap())
                cab["Cross-Origin-Opener-Policy"] = "same-origin"
                cab["Cross-Origin-Embedder-Policy"] = "require-corp"
                cab["Cross-Origin-Resource-Policy"] = "same-origin"
                r.responseHeaders = cab
                return r
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView?, callback: ValueCallback<Array<Uri>>?,
                params: FileChooserParams?
            ): Boolean {
                eleccionFichero?.onReceiveValue(arrayOf())
                eleccionFichero = callback
                selector.launch("video/*")
                return true
            }
        }

        web.addJavascriptInterface(Guardar(), "Guardar")
        web.loadUrl("https://appassets.androidplatform.net/assets/www/index.html")

        Actualizador.comprobar(this)
    }

    /** Puente JS → Descargas del móvil (la web le pasa el vídeo por trozos en base64). */
    inner class Guardar {
        private var flujo: OutputStream? = null
        private var uri: Uri? = null

        @JavascriptInterface
        fun empezar(nombre: String, mime: String) {
            val valores = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, nombre)
                put(MediaStore.Downloads.MIME_TYPE, mime)
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, valores)
                ?: throw IllegalStateException("No pude crear el archivo en Descargas")
            flujo = contentResolver.openOutputStream(uri!!)
        }

        @JavascriptInterface
        fun trozo(b64: String) {
            flujo?.write(Base64.decode(b64, Base64.DEFAULT))
        }

        @JavascriptInterface
        fun terminar() {
            flujo?.close()
            flujo = null
            uri?.let {
                val v = ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }
                contentResolver.update(it, v, null, null)
            }
            runOnUiThread {
                Toast.makeText(this@MainActivity, "Vídeo guardado en Descargas ✅", Toast.LENGTH_LONG).show()
            }
        }
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }
}
