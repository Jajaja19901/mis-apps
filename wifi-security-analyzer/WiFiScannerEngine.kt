package com.pentester.wifisecurity.core

import android.content.Context
import android.net.wifi.WifiManager
import android.net.wifi.ScanResult
import android.os.Build

/**
 * Motor de escaneo REAL de redes Wi-Fi
 * Accede directamente a WifiManager del sistema para obtener datos reales
 */
class WiFiScannerEngine(private val context: Context) {

    private val wifiManager: WifiManager? by lazy {
        context.getSystemService(Context.WIFI_SERVICE) as? WifiManager
    }

    data class NetworkInfo(
        val ssid: String,
        val bssid: String,
        val security: String,
        val frequency: Int,
        val level: Int,
        val timestamp: Long,
        val capabilities: String,
        val channel: Int,
        val band: String
    )

    /**
     * Escanea redes Wi-Fi disponibles en tiempo real
     * @return Lista de redes encontradas con información detallada
     */
    fun scanNetworks(): List<NetworkInfo> {
        val networks = mutableListOf<NetworkInfo>()

        try {
            // Iniciar escaneo
            wifiManager?.startScan()

            // Obtener resultados después de un pequeño delay
            Thread.sleep(2000)

            val scanResults = wifiManager?.scanResults ?: return emptyList()

            for (result in scanResults) {
                try {
                    val network = NetworkInfo(
                        ssid = result.SSID.replace("\"", ""),
                        bssid = result.BSSID,
                        security = parseSecurityType(result.capabilities),
                        frequency = result.frequency,
                        level = result.level,
                        timestamp = result.timestamp,
                        capabilities = result.capabilities,
                        channel = frequencyToChannel(result.frequency),
                        band = if (result.frequency > 5000) "5GHz" else "2.4GHz"
                    )
                    networks.add(network)
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        return networks.sortedByDescending { it.level }
    }

    /**
     * Obtiene el SSID actual de la red conectada
     */
    fun getCurrentNetwork(): String? {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // En Android 10+, WifiInfo.getSSID() requiere permisos
                val wifiInfo = wifiManager?.connectionInfo
                wifiInfo?.ssid?.replace("\"", "")
            } else {
                val wifiInfo = wifiManager?.connectionInfo
                wifiInfo?.ssid?.replace("\"", "")
            }
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Analiza el tipo de seguridad desde las capabilities
     */
    private fun parseSecurityType(capabilities: String): String {
        return when {
            capabilities.contains("WPA3") -> "WPA3"
            capabilities.contains("WPA2") -> "WPA2"
            capabilities.contains("WPA") -> "WPA"
            capabilities.contains("WEP") -> "WEP"
            else -> "Open"
        }
    }

    /**
     * Convierte frecuencia (MHz) a canal Wi-Fi
     */
    private fun frequencyToChannel(frequency: Int): Int {
        return when {
            frequency >= 2412 && frequency <= 2472 -> {
                // Banda 2.4GHz: Canal = (Frecuencia - 2407) / 5
                (frequency - 2407) / 5
            }
            frequency >= 5000 && frequency <= 6000 -> {
                // Banda 5GHz: Canal = (Frecuencia - 5000) / 5
                (frequency - 5000) / 5
            }
            else -> 0
        }
    }

    /**
     * Detects signal strength quality
     */
    fun getSignalQuality(level: Int): String {
        return when {
            level >= -50 -> "Excelente"
            level >= -60 -> "Muy buena"
            level >= -70 -> "Buena"
            level >= -80 -> "Débil"
            else -> "Muy débil"
        }
    }

    /**
     * Calcula interferencia en canal específico
     */
    fun analyzeChannelInterference(channel: Int): Pair<String, Int> {
        val networks = scanNetworks()
        val interferingNetworks = networks.filter {
            val diff = Math.abs(it.channel - channel)
            diff in 1..4  // Solapamiento
        }

        val interference = (interferingNetworks.size * 25).coerceIn(0, 100)
        val quality = when {
            interference <= 25 -> "Excelente"
            interference <= 50 -> "Buena"
            interference <= 75 -> "Regular"
            else -> "Mala"
        }

        return Pair(quality, interference)
    }

    /**
     * Obtiene recomendación de canales óptimos
     */
    fun getOptimalChannels(): List<Int> {
        val networks = scanNetworks()
        val usedChannels = networks.filter { it.band == "2.4GHz" }
            .map { it.channel }
            .distinct()

        // Canales sin solapamiento: 1, 6, 11 en 2.4GHz
        val optimalChannels = listOf(1, 6, 11)
        return optimalChannels.filter { it !in usedChannels }
    }
}
