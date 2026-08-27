package es.incubatunegocio.anonimizador

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/** Auto-actualización SILENCIOSA desde la release "anonimizador-apk" del repo.
 *
 *  Al abrir la app: comprueba version.json y, si hay versión nueva, la descarga y la
 *  instala en segundo plano con PackageInstaller. En Android 12+ y siendo la app su
 *  propio instalador, se aplica sin preguntar nada; la ÚNICA vez que Android muestra
 *  su diálogo es la primera auto-instalación (o en Android 10/11). */
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
                    act.runOnUiThread {
                        Toast.makeText(act, "Actualizando a la versión $nombre en segundo plano…",
                            Toast.LENGTH_LONG).show()
                    }
                    val apk = descargar(act, urlApk)
                    instalar(act, apk)
                }
            } catch (_: Exception) {
                // sin red o GitHub caído: la app funciona igual; se reintenta al próximo arranque
            }
        }
    }

    private fun descargar(ctx: Context, urlApk: String): File {
        val destino = File(ctx.cacheDir, "actualizacion.apk")
        val con = URL(urlApk).openConnection() as HttpURLConnection
        con.connectTimeout = 10000
        con.instanceFollowRedirects = true
        con.inputStream.use { entrada -> destino.outputStream().use { entrada.copyTo(it) } }
        con.disconnect()
        return destino
    }

    private fun instalar(ctx: Context, apk: File) {
        val instalador = ctx.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(
            PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(ctx.packageName)
            if (Build.VERSION.SDK_INT >= 31) {
                setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            }
        }
        val idSesion = instalador.createSession(params)
        instalador.openSession(idSesion).use { sesion ->
            sesion.openWrite("anonimizador.apk", 0, apk.length()).use { salida ->
                apk.inputStream().use { it.copyTo(salida) }
                sesion.fsync(salida)
            }
            val intento = Intent(ctx, InstalacionReceiver::class.java)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
            val pendiente = PendingIntent.getBroadcast(ctx, idSesion, intento, flags)
            sesion.commit(pendiente.intentSender)
        }
    }
}

/** Recibe el resultado de la instalación. Si Android exige confirmar (primera vez o
 *  Android 10/11), abre su diálogo del sistema; si no, la actualización ya está aplicada. */
class InstalacionReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -99)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirmar = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                confirmar?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                try { ctx.startActivity(confirmar) } catch (_: Exception) {}
            }
            PackageInstaller.STATUS_SUCCESS ->
                Toast.makeText(ctx, "Anonimizador actualizado ✅", Toast.LENGTH_LONG).show()
            else -> {
                val motivo = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
                if (motivo != null) {
                    Toast.makeText(ctx, "La actualización no se aplicó: $motivo", Toast.LENGTH_LONG).show()
                }
            }
        }
    }
}
