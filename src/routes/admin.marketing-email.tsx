import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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

function MarketingEmailPage() {
  const [audienceMode, setAudienceMode] = useState<"optedIn" | "import">("optedIn");
  const [optedInCount, setOptedInCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(true);
  const [csvText, setCsvText] = useState("");
  const [importedContacts, setImportedContacts] = useState<Contact[]>([]);

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
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
      const res =
        audienceMode === "optedIn"
          ? await sendOptedIn({
              data: { accessToken: token, subject: subject.trim(), message: message.trim() },
            })
          : await sendList({
              data: {
                accessToken: token,
                subject: subject.trim(),
                message: message.trim(),
                contacts: importedContacts,
              },
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
          GloriaFood export) for a one-off send. Sent via Resend — imported contacts are never added
          to this app's own customer list, so they get a reply-to-unsubscribe instruction instead of
          a one-click link.
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
              Paste CSV content (from GloriaFood's Marketing → Customers → Export, or any name/email
              export)
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

        <label className="mt-4 block text-sm font-semibold">Message</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={8}
          placeholder="Write the body of the email here. This becomes the email content, wrapped in Kosher Nosh branding automatically."
          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        />

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

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send to {audienceSize} recipients?</AlertDialogTitle>
            <AlertDialogDescription>
              This sends a real email to every recipient right now. This can't be undone once sent.
              <div className="mt-3 rounded-lg bg-muted/50 p-3 text-sm text-foreground">
                <div className="font-semibold">{subject}</div>
                <div className="mt-1 whitespace-pre-wrap">{message}</div>
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
