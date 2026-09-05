package com.koshernosh.tablet

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.webkit.JavascriptInterface
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.InetSocketAddress
import java.net.Socket
import java.nio.charset.Charset
import java.util.UUID
import java.util.concurrent.Executors

class PrinterBridge(private val context: Context) {
    private val executor = Executors.newSingleThreadExecutor()
    private val preferences = context.getSharedPreferences("nosh_tablet", Context.MODE_PRIVATE)

    @JavascriptInterface
    fun isAvailable(): Boolean = true

    @JavascriptInterface
    fun printOrder(json: String) {
        executor.execute {
            runCatching {
                val ticket = EscPosTicket.order(JSONObject(json))
                send(ticket)
            }.onSuccess {
                toast("Order printed")
            }.onFailure {
                toast("Print failed: ${it.message ?: "Unknown error"}")
            }
        }
    }

    fun testPrint(callback: (Result<Unit>) -> Unit) {
        executor.execute {
            val result = runCatching {
                send(EscPosTicket.test(preferences.getString("store_name", "The Kosher Nosh") ?: "The Kosher Nosh"))
            }
            context.runOnUiThread { callback(result) }
        }
    }

    private fun send(bytes: ByteArray) {
        when (preferences.getString("printer_mode", "bluetooth")) {
            "network" -> sendNetwork(bytes)
            else -> sendBluetooth(bytes)
        }
    }

    private fun sendNetwork(bytes: ByteArray) {
        val host = preferences.getString("printer_host", "")?.trim().orEmpty()
        require(host.isNotEmpty()) { "Printer IP is not configured" }
        val port = preferences.getInt("printer_port", 9100)
        Socket().use { socket ->
            socket.connect(InetSocketAddress(host, port), 5000)
            socket.soTimeout = 5000
            socket.getOutputStream().use { output ->
                output.write(bytes)
                output.flush()
            }
        }
    }

    private fun sendBluetooth(bytes: ByteArray) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED
        ) {
            error("Bluetooth permission is required")
        }
        val mac = preferences.getString("printer_mac", "")?.trim().orEmpty()
        require(mac.isNotEmpty()) { "Bluetooth printer is not configured" }
        val manager = context.getSystemService(BluetoothManager::class.java)
        val adapter: BluetoothAdapter = manager.adapter ?: error("Bluetooth is unavailable")
        val device = adapter.getRemoteDevice(mac)
        val uuid = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
        adapter.cancelDiscovery()
        device.createRfcommSocketToServiceRecord(uuid).use { socket ->
            socket.connect()
            socket.outputStream.use { output ->
                output.write(bytes)
                output.flush()
            }
        }
    }

    private fun toast(message: String) {
        context.runOnUiThread { Toast.makeText(context, message, Toast.LENGTH_LONG).show() }
    }

    private fun Context.runOnUiThread(block: () -> Unit) {
        (this as? android.app.Activity)?.runOnUiThread(block) ?: block()
    }
}

private object EscPosTicket {
    private val charset: Charset = Charset.forName("CP437")
    private const val WIDTH = 42

    fun test(store: String): ByteArray = build {
        center(); bold(true); size(2); line(store); size(1); bold(false)
        line("PRINTER TEST")
        line("Bluetooth / Network ESC-POS")
        line("------------------------------------------")
        line("If this printed clearly, setup is complete.")
        feed(4); cut()
    }

    fun order(order: JSONObject): ByteArray = build {
        center(); bold(true); size(2); line("THE KOSHER NOSH")
        size(1); line(order.optString("locationName", "")); line("")
        size(2); line("#${order.optString("orderNumber")}")
        size(1); bold(false)
        line(order.optString("orderType", "").uppercase())
        line(order.optString("promisedTime", "ASAP"))
        left(); separator()
        bold(true); line(order.optString("customerName", "")); bold(false)
        line(order.optString("customerPhone", ""))
        val address = order.optString("deliveryAddress", "")
        if (address.isNotBlank()) wrap(address).forEach(::line)
        separator()
        val items = order.optJSONArray("items") ?: JSONArray()
        for (index in 0 until items.length()) {
            val item = items.getJSONObject(index)
            bold(true); wrap("${item.optInt("quantity", 1)} x ${item.optString("name")}").forEach(::line); bold(false)
            val modifiers = item.optJSONArray("modifiers") ?: JSONArray()
            for (modifierIndex in 0 until modifiers.length()) {
                wrap("  + ${modifiers.optString(modifierIndex)}").forEach(::line)
            }
            val notes = item.optString("notes", "")
            if (notes.isNotBlank()) wrap("  NOTE: $notes").forEach(::line)
            line("")
        }
        separator()
        val notes = order.optString("notes", "")
        if (notes.isNotBlank()) {
            bold(true); line("ORDER NOTES"); bold(false)
            wrap(notes).forEach(::line)
            separator()
        }
        line("Payment: ${order.optString("paymentMethod", "")}")
        line("Total: ${order.optString("total", "")}")
        feed(4); cut()
    }

    private fun wrap(value: String): List<String> {
        val words = value.trim().split(Regex("\\s+"))
        val lines = mutableListOf<String>()
        var current = ""
        for (word in words) {
            if (current.isEmpty()) current = word
            else if (current.length + word.length + 1 <= WIDTH) current += " $word"
            else { lines += current; current = word }
        }
        if (current.isNotEmpty()) lines += current
        return lines
    }

    private fun build(block: Writer.() -> Unit): ByteArray {
        val writer = Writer()
        writer.initialize()
        writer.block()
        return writer.bytes()
    }

    private class Writer {
        private val output = ByteArrayOutputStream()
        fun initialize() = command(0x1B, 0x40)
        fun left() = command(0x1B, 0x61, 0)
        fun center() = command(0x1B, 0x61, 1)
        fun bold(on: Boolean) = command(0x1B, 0x45, if (on) 1 else 0)
        fun size(multiplier: Int) = command(0x1D, 0x21, if (multiplier > 1) 0x11 else 0)
        fun line(text: String) { output.write(text.toByteArray(charset)); output.write('\n'.code) }
        fun separator() = line("------------------------------------------")
        fun feed(lines: Int) = command(0x1B, 0x64, lines)
        fun cut() = command(0x1D, 0x56, 0)
        fun command(vararg values: Int) { values.forEach(output::write) }
        fun bytes(): ByteArray = output.toByteArray()
    }
}
