package es.incubatunegocio.anonimizador

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.content.Context
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import kotlin.math.max
import kotlin.math.sqrt

/** Inferencia ONNX nativa (todos los núcleos) para el motor web del WebView.
 *
 *  Protocolo (ArrayBuffer desde JS):
 *    cabecera Int32LE x4: [777, modelo (1=yolox, 2=matrículas), orden (1=BGR, 0=RGB), norm (1=/255, 0=nada)]
 *    después: píxeles RGBA del letterbox (tam x tam x 4); tam se deduce del tamaño.
 *  Respuesta: los floats crudos de la salida del modelo (LE), o "ERROR: …" como texto.
 */
object MotorNativo {

    private val env: OrtEnvironment = OrtEnvironment.getEnvironment()
    private val sesiones = HashMap<Int, OrtSession>()
    private val ficheros = mapOf(1 to "www/modelos/yolox_tiny.onnx", 2 to "www/modelos/plates-yolov9t-640.onnx")

    val nucleos: Int get() = max(2, Runtime.getRuntime().availableProcessors() - 1)

    @Synchronized
    private fun sesion(ctx: Context, modelo: Int): OrtSession =
        sesiones.getOrPut(modelo) {
            val bytes = ctx.assets.open(ficheros.getValue(modelo)).readBytes()
            val op = OrtSession.SessionOptions()
            op.setIntraOpNumThreads(nucleos)
            op.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
            env.createSession(bytes, op)
        }

    fun inferir(ctx: Context, peticion: ByteArray): ByteArray {
        val bb = ByteBuffer.wrap(peticion).order(ByteOrder.LITTLE_ENDIAN)
        require(bb.int == 777) { "cabecera desconocida" }
        val modelo = bb.int
        val bgr = bb.int == 1
        val norm = if (bb.int == 1) 255f else 1f
        val pix = peticion.size - 16
        val tam = sqrt(pix / 4.0).toInt()
        require(tam * tam * 4 == pix) { "tamaño de imagen no cuadrado" }

        // RGBA -> tensor CHW float (mismo orden/normalización que el motor JS)
        val n = tam * tam
        val t = FloatBuffer.allocate(3 * n)
        val base = 16
        val c0 = if (bgr) 2 else 0
        val c2 = if (bgr) 0 else 2
        for (i in 0 until n) {
            t.put(i, (peticion[base + i * 4 + c0].toInt() and 0xFF) / norm)
            t.put(n + i, (peticion[base + i * 4 + 1].toInt() and 0xFF) / norm)
            t.put(2 * n + i, (peticion[base + i * 4 + c2].toInt() and 0xFF) / norm)
        }

        OnnxTensor.createTensor(env, t, longArrayOf(1, 3, tam.toLong(), tam.toLong())).use { tensor ->
            sesion(ctx, modelo).run(mapOf("images" to tensor)).use { res ->
                val salida = res[0] as OnnxTensor
                val fb = salida.floatBuffer
                val out = ByteBuffer.allocate(fb.remaining() * 4).order(ByteOrder.LITTLE_ENDIAN)
                while (fb.hasRemaining()) out.putFloat(fb.get())
                return out.array()
            }
        }
    }
}
