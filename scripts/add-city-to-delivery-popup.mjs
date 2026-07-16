import fs from "node:fs";

const file = "src/routes/tablet.tsx";
let source = fs.readFileSync(file, "utf8");

if (source.includes("const [formattedDeliveryAddress, setFormattedDeliveryAddress]")) {
  console.log("Delivery popup city formatting already applied.");
  process.exit(0);
}

const importNeedle = 'import { dispatchShipday } from "@/lib/shipday.functions";';
const importReplacement = `${importNeedle}\nimport { geocodeAddress } from "@/lib/geocoding.functions";`;

const dialogNeedle = `function DeliveryChoiceDialog({\n  order,\n  busy,\n  onShipday,\n  onSelf,\n}: {\n  order: Order;\n  busy: boolean;\n  onShipday: () => void;\n  onSelf: () => void;\n}) {\n  return (`;

const dialogReplacement = `function DeliveryChoiceDialog({\n  order,\n  busy,\n  onShipday,\n  onSelf,\n}: {\n  order: Order;\n  busy: boolean;\n  onShipday: () => void;\n  onSelf: () => void;\n}) {\n  const [formattedDeliveryAddress, setFormattedDeliveryAddress] = useState(\n    order.delivery_address ?? \"\"\n  );\n\n  useEffect(() => {\n    if (!order.delivery_address) return;\n    let cancelled = false;\n    setFormattedDeliveryAddress(order.delivery_address);\n    void geocodeAddress({ data: { address: order.delivery_address } })\n      .then((result) => {\n        if (!cancelled && result.ok && result.formatted) {\n          setFormattedDeliveryAddress(result.formatted);\n        }\n      })\n      .catch(() => undefined);\n    return () => {\n      cancelled = true;\n    };\n  }, [order.delivery_address]);\n\n  return (`;

const addressNeedle = "<span>{order.delivery_address}</span>";
const addressReplacement = "<span>{formattedDeliveryAddress || order.delivery_address}</span>";

for (const [needle, replacement, label] of [
  [importNeedle, importReplacement, "geocoding import"],
  [dialogNeedle, dialogReplacement, "dialog formatter"],
  [addressNeedle, addressReplacement, "formatted address display"],
]) {
  if (!source.includes(needle)) {
    throw new Error(`Could not apply ${label}; expected source text was not found.`);
  }
  source = source.replace(needle, replacement);
}

fs.writeFileSync(file, source);
console.log("Added city/town to the delivery-choice popup address.");
