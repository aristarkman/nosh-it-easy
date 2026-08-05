package com.koshernosh.tablet

import android.Manifest
import android.app.AlertDialog
import android.bluetooth.BluetoothManager
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts

class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private lateinit var printer: PrinterBridge
    private val preferences by lazy { getSharedPreferences("nosh_tablet", MODE_PRIVATE) }

    private val bluetoothPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        Toast.makeText(this, if (granted) "Bluetooth permission granted" else "Bluetooth permission denied", Toast.LENGTH_LONG).show()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        printer = PrinterBridge(this)
        requestBluetoothPermissionIfNeeded()
        setContentView(buildScreen())
        loadTablet()
    }

    @Suppress("SetJavaScriptEnabled")
    private fun buildScreen(): LinearLayout {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.WHITE)
        }
        val toolbar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(16, 10, 16, 10)
            setBackgroundColor(Color.rgb(185, 28, 28))
        }
        toolbar.addView(TextView(this).apply {
            text = "Nosh Tablet"
            textSize = 20f
            setTextColor(Color.WHITE)
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        toolbar.addView(Button(this).apply {
            text = "Test Print"
            setOnClickListener { testPrint() }
        })
        toolbar.addView(Button(this).apply {
            text = "Printer Setup"
            setOnClickListener { showSettings() }
        })

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.setSupportZoom(false)
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    return !isTrustedUrl(request.url.toString())
                }
            }
            addJavascriptInterface(printer, "NoshPrinter")
        }

        root.addView(toolbar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(webView, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        return root
    }

    private fun loadTablet() {
        val url = preferences.getString("tablet_url", DEFAULT_TABLET_URL) ?: DEFAULT_TABLET_URL
        webView.loadUrl(url)
    }

    private fun isTrustedUrl(url: String): Boolean {
        return runCatching {
            val host = android.net.Uri.parse(url).host.orEmpty().lowercase()
            url.startsWith("https://") && (host == "koshernosh.com" || host.endsWith(".koshernosh.com") || host.endsWith(".lovable.app"))
        }.getOrDefault(false)
    }

    private fun showSettings() {
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(40, 12, 40, 0)
        }
        val url = field("Tablet URL", preferences.getString("tablet_url", DEFAULT_TABLET_URL).orEmpty())
        val store = field("Store name", preferences.getString("store_name", "Cresskill").orEmpty())
        val mode = Spinner(this).apply {
            adapter = ArrayAdapter(this@MainActivity, android.R.layout.simple_spinner_dropdown_item, listOf("Bluetooth", "Network"))
            setSelection(if (preferences.getString("printer_mode", "bluetooth") == "network") 1 else 0)
        }
        val mac = field("Bluetooth MAC address", preferences.getString("printer_mac", "").orEmpty())
        val host = field("Network printer IP", preferences.getString("printer_host", "").orEmpty())
        val port = field("Network port", preferences.getInt("printer_port", 9100).toString(), true)

        container.addView(label("Tablet URL")); container.addView(url)
        container.addView(label("Store")); container.addView(store)
        container.addView(label("Printer connection")); container.addView(mode)
        container.addView(label("Bluetooth MAC — Cresskill MUNBYN")); container.addView(mac)
        container.addView(label("Printer IP — Glen Rock Epson")); container.addView(host)
        container.addView(label("Network port")); container.addView(port)

        AlertDialog.Builder(this)
            .setTitle("Printer Setup")
            .setView(container)
            .setPositiveButton("Save") { _, _ ->
                preferences.edit()
                    .putString("tablet_url", url.text.toString().trim())
                    .putString("store_name", store.text.toString().trim())
                    .putString("printer_mode", if (mode.selectedItemPosition == 1) "network" else "bluetooth")
                    .putString("printer_mac", mac.text.toString().trim())
                    .putString("printer_host", host.text.toString().trim())
                    .putInt("printer_port", port.text.toString().toIntOrNull() ?: 9100)
                    .apply()
                loadTablet()
            }
            .setNeutralButton("Paired Devices") { _, _ -> showPairedDevices() }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showPairedDevices() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
            requestBluetoothPermissionIfNeeded()
            return
        }
        val adapter = getSystemService(BluetoothManager::class.java).adapter
        val devices = adapter?.bondedDevices?.sortedBy { it.name ?: it.address }.orEmpty()
        val labels = devices.map { "${it.name ?: "Bluetooth device"}\n${it.address}" }.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle("Select paired printer")
            .setItems(labels) { _, index ->
                preferences.edit().putString("printer_mac", devices[index].address).putString("printer_mode", "bluetooth").apply()
                Toast.makeText(this, "Selected ${devices[index].name ?: devices[index].address}", Toast.LENGTH_LONG).show()
            }
            .setNegativeButton("Close", null)
            .show()
    }

    private fun testPrint() {
        printer.testPrint { result ->
            Toast.makeText(this, result.fold({ "Test receipt printed" }, { "Print failed: ${it.message}" }), Toast.LENGTH_LONG).show()
        }
    }

    private fun requestBluetoothPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
            bluetoothPermission.launch(Manifest.permission.BLUETOOTH_CONNECT)
        }
    }

    private fun label(text: String) = TextView(this).apply { this.text = text; setPadding(0, 14, 0, 2) }
    private fun field(hint: String, value: String, numeric: Boolean = false) = EditText(this).apply {
        this.hint = hint
        setText(value)
        if (numeric) inputType = InputType.TYPE_CLASS_NUMBER
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    companion object {
        private const val DEFAULT_TABLET_URL = "https://takeout.koshernosh.com/tablet"
    }
}
