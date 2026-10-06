# Nosh Tablet Android App

Native Android wrapper for the Nosh tablet page with direct ESC/POS printing.

## Supported store setups

- **Cresskill:** MUNBYN P047 over Bluetooth SPP/RFCOMM.
- **Glen Rock:** Epson M362B / TM-m30II over Ethernet or Wi-Fi using TCP port 9100.

## Build the APK

1. Install Android Studio.
2. Open the `android-tablet` folder as a project.
3. Allow Gradle to sync and install any requested Android SDK components.
4. Choose **Build → Build APK(s)**.
5. Install the generated debug APK on the store tablet for testing.

## First-time setup

1. Open **Nosh Tablet**.
2. Tap **Printer Setup**.
3. Confirm the tablet URL. The default is `https://takeout.koshernosh.com/tablet` and can be changed in the app.
4. Enter the store name.
5. Configure the printer:
   - Cresskill: choose **Bluetooth**, pair the MUNBYN in Android settings, tap **Paired Devices**, and select it.
   - Glen Rock: choose **Network**, enter the Epson printer IP, and leave the port at `9100`.
6. Tap **Test Print**.

## Web integration

The app injects a trusted JavaScript bridge named `window.NoshPrinter` into the tablet WebView. The website helper is in `src/lib/native-printer.ts`.

Example:

```ts
printNativeOrder({
  orderNumber: "1234",
  locationName: "Cresskill",
  orderType: "delivery",
  promisedTime: "ASAP",
  customerName: "Customer Name",
  customerPhone: "201-555-0100",
  deliveryAddress: "1 Main St, Demarest, NJ 07627",
  paymentMethod: "Credit card",
  total: "$42.00",
  items: [{ quantity: 1, name: "Pastrami Sandwich", modifiers: ["Rye", "Mustard"] }],
});
```

## Production checklist

- Confirm the live tablet URL.
- Test Bluetooth reconnection after restarting the Cresskill tablet and printer.
- Reserve a fixed IP address for the Glen Rock Epson.
- Confirm ticket cutting on both printers.
- Connect automatic printing to the tablet order acceptance workflow.
- Add a visible **Reprint** control and print-status logging before replacing GloriaFood printing.
