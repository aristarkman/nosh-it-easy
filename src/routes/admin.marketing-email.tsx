import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  getMarketingEmailAudienceCount,
  sendMarketingEmailBlastToOptedIn,
  sendMarketingEmailBlastToList,
} from "@/lib/marketing-email.functions";
import { Loader2, Send, Users, AlertCircle, CheckCircle2, Upload } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/admin/marketing-email")({
  head: () => ({ meta: [{ title: "Marketing Email — Admin" }] }),
  component: MarketingEmailPage,
});

type Contact = { email: string; name?: string };

// Minimal CSV parser: handles a header row (looks for email/name-ish
// column names) and simple quoted fields. Not a full RFC 4180 parser --
// good enough for a GloriaFood-style export (name, email, phone columns,
// no embedded commas/newlines inside fields).
function parseCsv(text: string): Contact[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const splitRow = (line: string) => {
    const cells: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === "," && !inQuotes) {
        cells.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    cells.push(cur.trim());
    return cells.map((c) => c.replace(/^"|"$/g, ""));
  };

  const header = splitRow(lines[0]).map((h) => h.toLowerCase());
  const emailIdx = header.findIndex((h) => h.includes("email"));
  const nameIdx = header.findIndex((h) => h.includes("name"));

  // No recognizable header -- assume no header row, email in column 0.
  const hasHeader = emailIdx !== -1;
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const eIdx = hasHeader ? emailIdx : 0;
  const nIdx = hasHeader ? nameIdx : -1;

  const out: Contact[] = [];
  for (const line of dataLines) {
    const cells = splitRow(line);
    const email = cells[eIdx]?.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    out.push({ email, name: nIdx >= 0 ? cells[nIdx]?.trim() || undefined : undefined });
  }
  return out;
}

const BRAND_COLOR = "#D6472E";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function nl2br(s: string): string {
  return esc(s).replace(/\n/g, "<br>");
}

// Client-side mirror of the edge function's buildHtml, for an accurate
// live preview before actually sending. Kept in sync by hand -- if the
// edge function's template changes, update this too.
function buildPreviewHtml(input: {
  message: string;
  contentType: "text" | "html";
  ctaLabel: string;
  ctaUrl: string;
}): string {
  const body = input.contentType === "html" ? input.message : nl2br(input.message);
  const cta =
    input.ctaLabel.trim() && input.ctaUrl.trim()
      ? `<table role="presentation" style="margin:28px 0 4px;"><tr><td style="border-radius:999px;background:${BRAND_COLOR};"><a href="${esc(
          input.ctaUrl,
        )}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${esc(
          input.ctaLabel,
        )}</a></td></tr></table>`
      : "";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f5;">
    <table role="presentation" width="100%" style="background:#f4f4f5;padding:32px 16px;"><tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="background:${BRAND_COLOR};padding:28px 32px;">
          <span style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:0.02em;">The Kosher Nosh</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <div style="font-size:15px;line-height:1.65;color:#1a1a1a;">${body}</div>
          ${cta}
        </td></tr>
        <tr><td style="padding:20px 32px;background:#fafafa;border-top:1px solid #eee;">
          <p style="font-size:11px;color:#999;line-height:1.6;margin:0;">[Your mailing address]<br><a href="#" style="color:#999;">Unsubscribe</a></p>
        </td></tr>
      </table>
    </td></tr></table>
  </body></html>`;
}

function MarketingEmailPage() {
  const [audienceMode, setAudienceMode] = useState<"optedIn" | "import">("optedIn");
  const [optedInCount, setOptedInCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(true);
  const [csvText, setCsvText] = useState("");
  const [importedContacts, setImportedContacts] = useState<Contact[]>([]);

  const [subject, setSubject] = useState("");
  const [contentType, setContentType] = useState<"text" | "html">("text");
  const [message, setMessage] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");

  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<{
    audience: number;
    sent: number;
    failed: number;
    truncated: boolean;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const getCount = useServerFn(getMarketingEmailAudienceCount);
  const sendOptedIn = useServerFn(sendMarketingEmailBlastToOptedIn);
  const sendList = useServerFn(sendMarketingEmailBlastToList);

  async function loadCount() {
    setLoadingCount(true);
    setErr(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        setErr("Please sign in again.");
        return;
      }
      const res = await getCount({ data: { accessToken: token } });
      if (res.ok) setOptedInCount(res.count);
      else setErr(res.error ?? "Could not load audience count");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingCount(false);
    }
  }
  useEffect(() => {
    loadCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setImportedContacts(csvText.trim() ? parseCsv(csvText) : []);
  }, [csvText]);

  const previewHtml = useMemo(
    () => buildPreviewHtml({ message, contentType, ctaLabel, ctaUrl }),
    [message, contentType, ctaLabel, ctaUrl],
  );

  const audienceSize = audienceMode === "optedIn" ? (optedInCount ?? 0) : importedContacts.length;
  const canSend = subject.trim() && message.trim() && audienceSize > 0 && !sending;

  async function confirmSend() {
    setConfirmOpen(false);
    setSending(true);
    setResult(null);
    setErr(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        setErr("Please sign in again.");
        return;
      }
      const content = {
        subject: subject.trim(),
        message: message.trim(),
        contentType,
        ctaLabel: ctaLabel.trim() || undefined,
        ctaUrl: ctaUrl.trim() || undefined,
      };
      const res =
        audienceMode === "optedIn"
          ? await sendOptedIn({ data: { accessToken: token, ...content } })
          : await sendList({
              data: { accessToken: token, ...content, contacts: importedContacts },
            });
      if (res.ok) {
        setResult({
          audience: res.audience,
          sent: res.sent,
          failed: res.failed,
          truncated: res.truncated,
        });
        setSubject("");
        setMessage("");
        setCtaLabel("");
        setCtaUrl("");
        setCsvText("");
      } else {
        setErr(res.error ?? "Send failed");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
      if (audienceMode === "optedIn") loadCount();
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">Marketing Email</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Send to customers who opted in via account settings, or import an external list (e.g. a
          GloriaFood export) for a one-off send. Sent via Resend, wrapped in a branded template
          automatically.
        </p>
        <div className="mt-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
          One-time setup: set{" "}
          <code className="rounded bg-black/10 px-1 py-0.5">BUSINESS_MAILING_ADDRESS</code>{" "}
          (required on every marketing email by law) and{" "}
          <code className="rounded bg-black/10 px-1 py-0.5">UNSUBSCRIBE_SECRET</code> (same value in
          both Lovable Cloud secrets and the send-marketing-email Supabase Edge Function secrets)
          before sending anything for real.
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex gap-2">
            <button
              onClick={() => setAudienceMode("optedIn")}
              className={`rounded-full px-4 py-2 text-sm font-bold ${
                audienceMode === "optedIn"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border"
              }`}
            >
              Opted-in customers
            </button>
            <button
              onClick={() => setAudienceMode("import")}
              className={`rounded-full px-4 py-2 text-sm font-bold ${
                audienceMode === "import"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border"
              }`}
            >
              Import a list
            </button>
          </div>

          {audienceMode === "optedIn" ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="size-4" />
              {loadingCount
                ? "Loading…"
                : `${optedInCount ?? 0} opted-in recipient${optedInCount === 1 ? "" : "s"}`}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-semibold">
                <Upload className="mr-1 inline size-4" />
                Paste CSV content (from GloriaFood's Marketing → Customers → Export, or any
                name/email export)
              </label>
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                rows={6}
                placeholder={"name,email,phone\nJane Doe,jane@example.com,201-555-0100"}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 font-mono text-xs outline-none focus:border-primary"
              />
              <div className="text-sm text-muted-foreground">
                <Users className="mr-1 inline size-4" />
                {importedContacts.length} valid recipient{importedContacts.length === 1 ? "" : "s"}{" "}
                detected
              </div>
            </div>
          )}

          <label className="mt-5 block text-sm font-semibold">Subject</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Our new online ordering site is here!"
            maxLength={200}
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />

          <div className="mt-4 flex items-center justify-between">
            <label className="block text-sm font-semibold">Message</label>
            <div className="flex gap-1 rounded-full bg-muted p-0.5 text-xs font-bold">
              <button
                onClick={() => setContentType("text")}
                className={`rounded-full px-3 py-1 ${contentType === "text" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
              >
                Plain text
              </button>
              <button
                onClick={() => setContentType("html")}
                className={`rounded-full px-3 py-1 ${contentType === "html" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
              >
                Custom HTML
              </button>
            </div>
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={8}
            placeholder={
              contentType === "text"
                ? "Write the body of the email here. Line breaks become paragraphs automatically."
                : "Paste your own HTML here \u2014 sent as-is inside the branded header/footer."
            }
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 font-mono text-xs outline-none focus:border-primary"
          />

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground">
                Button text (optional)
              </label>
              <input
                value={ctaLabel}
                onChange={(e) => setCtaLabel(e.target.value)}
                placeholder="Order Now"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground">
                Button link
              </label>
              <input
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                placeholder="https://takeout.koshernosh.com"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>

          <button
            onClick={() => setConfirmOpen(true)}
            disabled={!canSend}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-40"
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {sending
              ? "Sending…"
              : `Send to ${audienceSize} recipient${audienceSize === 1 ? "" : "s"}`}
          </button>

          {result && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-300">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              <span>
                Sent {result.sent} of {result.audience}
                {result.failed > 0 && `, ${result.failed} failed`}.
                {result.truncated &&
                  " Audience list was capped at 2,000 — run again to reach the rest."}
              </span>
            </div>
          )}
          {err && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span className="break-all">{err}</span>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-3">
          <div className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Live preview
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-white">
            <iframe
              title="Email preview"
              srcDoc={previewHtml}
              className="h-[600px] w-full"
              sandbox=""
            />
          </div>
        </section>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send to {audienceSize} recipients?</AlertDialogTitle>
            <AlertDialogDescription>
              This sends a real email to every recipient right now. This can't be undone once sent.
              <div className="mt-3 rounded-lg bg-muted/50 p-3 text-sm text-foreground">
                <div className="font-semibold">{subject}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Check the live preview on the page to confirm formatting before sending.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSend}>Send now</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
