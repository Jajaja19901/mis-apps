package es.incubatunegocio.anonimizador

import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/** Auto-actualización desde la release "anonimizador-apk" del repo.
 *  Comprueba version.json al arrancar; si hay versión nueva, descarga el APK
 *  y abre el instalador (Android pide una confirmación al usuario). */
object Actualizador {

    private const val BASE = "https://github.com/Jajaja19901/mis-apps/releases/download/anonimizador-apk"
    private const val URL_VERSION = "$BASE/version.json"

    fun comprobar(act: AppCompatActivity) {
        thread {
            try {
                val con = URL(URL_VERSION).openConnection() as HttpURLConnection
                con.connectTimeout = 6000
                con.readTimeout = 6000
                con.instanceFollowRedirects = true
                val texto = con.inputStream.bufferedReader().readText()
                con.disconnect()
                val j = JSONObject(texto)
                val nuevo = j.getInt("versionCode")
                val nombre = j.optString("versionName", nuevo.toString())
                val urlApk = j.optString("apk", "$BASE/anonimizador.apk")
                val actual = act.packageManager.getPackageInfo(act.packageName, 0).longVersionCode
                if (nuevo > actual) {
                    act.runOnUiThread { preguntar(act, nombre, urlApk) }
                }
            } catch (_: Exception) {
                // sin red o GitHub caído: la app funciona igual, se reintenta al próximo arranque
            }
        }
    }

    private fun preguntar(act: AppCompatActivity, nombre: String, urlApk: String) {
        if (act.isFinishing) return
        AlertDialog.Builder(act)
            .setTitle("Actualización disponible")
            .setMessage("Hay una versión nueva del Anonimizador ($nombre). ¿Actualizar ahora? " +
                    "Se descarga de GitHub y Android te pedirá confirmar la instalación.")
            .setPositiveButton("Actualizar") { _, _ -> descargar(act, urlApk) }
            .setNegativeButton("Ahora no", null)
            .show()
    }

    private fun descargar(act: AppCompatActivity, urlApk: String) {
        val caja = LinearLayout(act).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 32, 48, 16)
            addView(TextView(act).apply { text = "Descargando actualización…" })
            addView(ProgressBar(act, null, android.R.attr.progressBarStyleHorizontal).apply {
                isIndeterminate = false; max = 100; tag = "barra"
            })
        }
        val dialogo = AlertDialog.Builder(act).setView(caja).setCancelable(false).create()
        dialogo.show()
        val barra = caja.findViewWithTag<ProgressBar>("barra")
        thread {
            try {
                val destino = File(act.cacheDir, "actualizacion.apk")
                val con = URL(urlApk).openConnection() as HttpURLConnection
                con.connectTimeout = 10000
                con.instanceFollowRedirects = true
                val total = con.contentLengthLong
                con.inputStream.use { entrada ->
                    destino.outputStream().use { salida ->
                        val buf = ByteArray(1 shl 16)
                        var leidos = 0L
                        while (true) {
                            val n = entrada.read(buf)
                            if (n < 0) break
                            salida.write(buf, 0, n)
                            leidos += n
                            if (total > 0) act.runOnUiThread { barra.progress = (leidos * 100 / total).toInt() }
                        }
                    }
                }
                con.disconnect()
                val uri: Uri = FileProvider.getUriForFile(act, act.packageName + ".fileprovider", destino)
                val intento = Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                act.runOnUiThread { dialogo.dismiss(); act.startActivity(intento) }
            } catch (e: Exception) {
                act.runOnUiThread {
                    dialogo.dismiss()
                    AlertDialog.Builder(act).setTitle("No se pudo descargar")
                        .setMessage("Inténtalo más tarde o descarga el APK desde la release de GitHub.\n\n${e.message}")
                        .setPositiveButton("Vale", null).show()
                }
            }
        }
    }
}
