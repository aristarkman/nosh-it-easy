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

export const getFtdConfig = createServerFn({ method: "GET" }).handler(async () => {
  const authToken = process.env.IPOSPAYS_API_KEY;
  const tpn = process.env.IPOSPAYS_TERMINAL_ID;
  if (!authToken || !tpn) throw new Error("iPOSpays credentials are not configured");
  return { authToken, tpn, scriptUrl: FTD_SCRIPT(), live: isLive() };
});

export const chargeWithToken = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        paymentTokenId: z.string().min(8),
        amountCents: z.number().int().positive().max(100_000_00),
        referenceId: z.string().min(1).max(40),
        invoiceNumber: z.string().max(40).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const authToken = process.env.IPOSPAYS_API_KEY!;
    const tpn = process.env.IPOSPAYS_TERMINAL_ID!;

    const body = {
      merchantAuthentication: {
        merchantId: tpn,
        transactionReferenceId: data.referenceId,
      },
      transactionRequest: {
        transactionType: 1,
        amount: String(data.amountCents),
        paymentTokenId: data.paymentTokenId,
        applySteamSettingTipFeeTax: false,
        invoiceNumber: data.invoiceNumber ?? data.referenceId,
      },
      preferences: {
        eReceipt: false,
        requestCardToken: false,
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
