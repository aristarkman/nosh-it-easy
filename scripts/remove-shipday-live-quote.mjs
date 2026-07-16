import { readFile, writeFile } from "node:fs/promises";

const checkoutPath = new URL("../src/routes/checkout.tsx", import.meta.url);
let source = await readFile(checkoutPath, "utf8");
const original = source;

source = source.replace(
  'import { dispatchShipday, quoteShipday } from "@/lib/shipday.functions";',
  'import { dispatchShipday } from "@/lib/shipday.functions";'
);

source = source.replace(
  /\n  \/\/ Live Shipday on-demand quote for ASAP deliveries only\.[\s\S]*?\n  const deliveryFee =\n    orderType === "delivery" \? liveQuote\?\.fee \?\? matchedZone\?\.fee \?\? 0 : 0;/,
  '\n  // Delivery pricing comes from the configured store delivery zone.\n  const deliveryFee = orderType === "delivery" ? matchedZone?.fee ?? 0 : 0;'
);

source = source.replace(
  '    (orderType === "pickup" || (address.trim().length > 5 && zoneOk && (whenType !== "asap" || !quoteError)));',
  '    (orderType === "pickup" || (address.trim().length > 5 && zoneOk));'
);

source = source.replace(
  /\{matchedZone && zoneOk && !liveQuote && !quoteError && \([\s\S]*?\n              \{quoteError && address\.trim\(\)\.length >= 5 && zip\.length === 5 && \([\s\S]*?\n              \)\}/,
  `{matchedZone && zoneOk && (\n                <p className="text-xs text-muted-foreground">\n                  Delivery to {zip}: {fmt(matchedZone.fee)} fee · {fmt(matchedZone.minimum)} minimum.\n                </p>\n              )}`
);

if (source !== original) {
  await writeFile(checkoutPath, source, "utf8");
  console.log("Removed Shipday live quote from checkout; zone pricing remains active.");
} else {
  console.log("Shipday live quote already removed from checkout.");
}
