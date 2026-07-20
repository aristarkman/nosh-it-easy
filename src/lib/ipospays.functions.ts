import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const env = () => (process.env.IPOSPAYS_ENV ?? "sandbox").toLowerCase();
const isLive = () => env() === "live" || env() === "production";

const FTD_SCRIPT = () =>
  isLive()
    ? "https://payment.ipospays.com/ftd/v1/freedomtodesign.js"
    : "https://payment.ipospays.tech/ftd/v1/freedomtodesign.js";

const TRANSACT_URL = () =>
  isLive()
    ? "https://payment.ipospays.com/api/v3/iposTransact"
    : "https://payment.ipospays.tech/api/v3/iposTransact";

// The iposTransact API does NOT accept the FTD security key (IPOSPAYS_API_KEY)
// as its auth token — that key only authenticates the client-side card-capture
// widget. iposTransact needs its own short-lived JWT, generated from a
// separate api key + secret key pair via this endpoint. See:
// https://docs.ipospays.com/ipos-pays-authentication-token-api
const AUTH_TOKEN_URL = () =>
  isLive()
    ? "https://auth.ipospays.com/v1/authenticate-token"
    : "https://auth.ipospays.tech/v1/authenticate-token";

async function getTransactAuthToken(): Promise<string> {
  const apiKey = process.env.IPOSPAYS_TRANSACT_API_KEY;
  const secretKey = process.env.IPOSPAYS_TRANSACT_SECRET_KEY;
  if (!apiKey || !secretKey) {
    throw new Error(
      "iPOSpays transact credentials are not configured (IPOSPAYS_TRANSACT_API_KEY / IPOSPAYS_TRANSACT_SECRET_KEY). " +
        "Generate these under Settings → Generate API & Secret Key in the iPOSpays portal — this is a different pair " +
        "from the Freedom to Design security key.",
    );
  }

  const res = await fetch(AUTH_TOKEN_URL(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, secretKey, scope: "PaymentTokenization" }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.token) {
    console.error("iPOSpays auth token request failed", { status: res.status, json });
    throw new Error(json?.errorMessage ?? "Could not authenticate with iPOSpays.");
  }
  return json.token as string;
}

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
    const tpn = process.env.IPOSPAYS_TERMINAL_ID!;
    const authToken = await getTransactAuthToken();

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
    const tr = json?.transactionResponse ?? json?.response ?? {};
    const status =
      tr.responseCode ?? json?.responseCode ?? json?.status ?? (res.ok ? "00" : "ERR");
    const approved =
      res.ok &&
      (status === "00" || status === "000" || /approved/i.test(String(tr.responseMessage ?? "")));

    if (!approved) {
      console.error("iPOSpays declined", { status: res.status, json });
      return {
        ok: false as const,
        message: tr.responseMessage ?? json?.message ?? "Payment was declined.",
        raw: json,
      };
    }

    return {
      ok: true as const,
      rrn: tr.RRN ?? tr.rrn ?? null,
      authCode: tr.authCode ?? tr.approvalCode ?? null,
      maskedCard: tr.maskedCardNumber ?? tr.cardNumber ?? null,
      cardType: tr.cardType ?? null,
      transactionId: tr.transactionId ?? tr.txnId ?? null,
    };
  });
