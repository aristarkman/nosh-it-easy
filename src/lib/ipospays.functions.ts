import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const env = () => (process.env.IPOSPAYS_ENV ?? "sandbox").toLowerCase();
const isLive = () => env() === "live" || env() === "production";

const FTD_SCRIPT = () =>
  isLive()
    ? "https://payment.ipospays.com/ftd/v1/freedomtodesign.js"
    : "https://payment.ipospays.tech/ftd/v1/freedomtodesign.js";

// iPOSpays support confirmed: the V3 iposTransact endpoint is NOT supported
// for FTD paymentTokenId sales — V3 requires the merchant account to be
// separately activated for the "PaymentTokenization" JWT scope. FTD
// paymentTokenId charges must go through V1 or V2 instead, authenticated
// with the same simple portal-generated Ecom Token used by the FTD widget
// itself (IPOSPAYS_API_KEY) — no separate JWT auth flow needed.
const TRANSACT_URL = () =>
  isLive()
    ? "https://payment.ipospays.com/api/v1/iposTransact"
    : "https://payment.ipospays.tech/api/v1/iposTransact";

const GPAY_SCRIPT = () =>
  isLive()
    ? "https://payment.ipospays.com/ftd/v1/gpay.js"
    : "https://payment.ipospays.tech/ftd/v1/gpay.js";

export const getFtdConfig = createServerFn({ method: "GET" }).handler(async () => {
  const authToken = process.env.IPOSPAYS_API_KEY;
  const tpn = process.env.IPOSPAYS_TERMINAL_ID;
  if (!authToken || !tpn) throw new Error("iPOSpays credentials are not configured");
  console.log("iPOSpays FTD config", {
    tpn,
    tokenLength: authToken.length,
    tokenMasked:
      authToken.length > 8
        ? `${authToken.slice(0, 4)}…${authToken.slice(-4)}`
        : "(too short to mask)",
  });
  return { authToken, tpn, scriptUrl: FTD_SCRIPT(), live: isLive() };
});

// GOOGLE_MERCHANT_ID comes from the Google Pay Business Console
// (pay.google.com/business/console) — a separate signup from iPOSpays.
// "N/A" is a valid placeholder for TEST mode while that's pending; swap in
// the real ID and flip GOOGLE_PAY_MODE to "PRODUCTION" once it's issued.
export const getGooglePayConfig = createServerFn({ method: "GET" }).handler(async () => {
  const merchantId = process.env.GOOGLE_MERCHANT_ID?.trim() || "N/A";
  const mode = (
    process.env.GOOGLE_PAY_MODE?.trim() || (isLive() ? "PRODUCTION" : "TEST")
  ).toUpperCase();
  return { scriptUrl: GPAY_SCRIPT(), merchantId, mode };
});

export const chargeWithToken = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        paymentTokenId: z.string().min(8).optional(),
        // Encrypted payload from iPOSpays' gpay.js callback — opaque to us,
        // passed straight through to iposTransact's preferences.GooglePay.
        googlePayToken: z.record(z.string(), z.unknown()).optional(),
        amountCents: z.number().int().positive().max(100_000_00),
        referenceId: z.string().min(1).max(40),
        invoiceNumber: z.string().max(40).optional(),
      })
      .refine((v) => v.paymentTokenId || v.googlePayToken, {
        message: "Either paymentTokenId or googlePayToken is required",
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const authToken = process.env.IPOSPAYS_API_KEY!;
    const tpn = process.env.IPOSPAYS_TERMINAL_ID!;

    const maskedToken =
      authToken.length > 8
        ? `${authToken.slice(0, 4)}…${authToken.slice(-4)}`
        : "(too short to mask)";
    console.log("iPOSpays transact request", {
      url: TRANSACT_URL(),
      tpn,
      tokenLength: authToken.length,
      tokenMasked: maskedToken,
      referenceId: data.referenceId,
    });

    const body = {
      merchantAuthentication: {
        merchantId: tpn,
        transactionReferenceId: data.referenceId,
      },
      transactionRequest: {
        transactionType: 1,
        amount: String(data.amountCents),
        // Per iPOSpays docs: when GooglePay is passed in preferences,
        // paymentTokenId/cardToken must be omitted (not just null).
        ...(data.paymentTokenId ? { paymentTokenId: data.paymentTokenId } : {}),
        applySteamSettingTipFeeTax: false,
        invoiceNumber: data.invoiceNumber ?? data.referenceId,
      },
      preferences: {
        eReceipt: false,
        requestCardToken: false,
        ...(data.googlePayToken ? { GooglePay: data.googlePayToken } : {}),
      },
    };

    const res = await fetch(TRANSACT_URL(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        token: authToken,
      },
      body: JSON.stringify(body),
    });

    const json = await res.json().catch(() => ({}));
    // Per iPOSpays' docs the real envelope is "iposTransactResponse" with
    // responseCode 200/400 — keep the older guessed shapes as fallbacks in
    // case of version drift, but prefer the documented one.
    const tr = json?.iposTransactResponse ?? json?.transactionResponse ?? json?.response ?? {};
    const status = tr.responseCode ?? json?.responseCode ?? json?.status ?? (res.ok ? 200 : "ERR");
    const approved =
      res.ok &&
      (status === 200 ||
        status === "200" ||
        status === "00" ||
        status === "000" ||
        /successful|approved/i.test(String(tr.responseMessage ?? "")));

    if (!approved) {
      console.error("iPOSpays declined", { status: res.status, json });
      return {
        ok: false as const,
        message:
          tr.errResponseMessage ?? tr.responseMessage ?? json?.message ?? "Payment was declined.",
        raw: json,
      };
    }

    return {
      ok: true as const,
      rrn: tr.RRN ?? tr.rrn ?? null,
      authCode: tr.responseApprovalCode ?? tr.authCode ?? tr.approvalCode ?? null,
      maskedCard: tr.maskedCardNumber ?? tr.cardNumber ?? null,
      cardType: tr.cardType ?? null,
      transactionId: tr.transactionId ?? tr.txnId ?? null,
    };
  });
