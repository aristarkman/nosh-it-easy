import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMarketingSmsAudienceCount, sendMarketingSmsBlast } from "@/lib/sms.functions";
import { Loader2, Send, Users, AlertCircle, CheckCircle2 } from "lucide-react";
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

export const Route = createFileRoute("/admin/marketing")({
  head: () => ({ meta: [{ title: "Marketing SMS — Admin" }] }),
  component: MarketingPage,
});

// SMS segment math: GSM-7 (plain ASCII) is 160 chars/segment (153 once
// concatenated across multiple segments); any unicode character (emoji,
// curly quotes, etc.) drops it to 70/67. Kept simple and slightly
// conservative rather than exact -- good enough for a cost/length sanity
// check, not a billing-precision calculator.
function estimateSegments(text: string): number {
  let isUnicode = false;
  for (const ch of text) {
    if (ch.codePointAt(0)! > 127) {
      isUnicode = true;
      break;
    }
  }
  const single = isUnicode ? 70 : 160;
  const multi = isUnicode ? 67 : 153;
  if (text.length <= single) return text.length === 0 ? 0 : 1;
  return Math.ceil(text.length / multi);
}

function MarketingPage() {
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<number | null>(null);
  const [loadingAudience, setLoadingAudience] = useState(true);
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<{
    audience: number;
    sent: number;
    failed: number;
    truncated: boolean;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const getAudience = useServerFn(getMarketingSmsAudienceCount);
  const sendBlast = useServerFn(sendMarketingSmsBlast);

  async function loadAudience() {
    setLoadingAudience(true);
    setErr(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        setErr("Please sign in again.");
        return;
      }
      const res = await getAudience({ data: { accessToken: token } });
      if (res.ok) setAudience(res.count);
      else setErr(res.error ?? "Could not load audience count");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingAudience(false);
    }
  }
  useEffect(() => {
    loadAudience();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trimmed = message.trim();
  const willAutoPrefix = trimmed.length > 0 && !/^the kosher nosh/i.test(trimmed);
  const willAutoSuffix = trimmed.length > 0 && !/reply stop/i.test(trimmed);
  const previewBody =
    (willAutoPrefix ? "The Kosher Nosh: " : "") +
    trimmed +
    (willAutoSuffix ? " Reply STOP to opt out." : "");
  const segments = estimateSegments(previewBody);

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
      const res = await sendBlast({ data: { accessToken: token, message: trimmed } });
      if (res.ok) {
        setResult({
          audience: res.audience,
          sent: res.sent,
          failed: res.failed,
          truncated: res.truncated,
        });
        setMessage("");
      } else {
        setErr(res.error ?? "Send failed");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
      loadAudience();
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">Marketing SMS</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sends only to customers who opted in to "Text me deals, specials &amp; cart reminders" in
          their account settings. Order-status texts are a separate, per-order consent and aren't
          affected by this page.
        </p>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="size-4" />
          {loadingAudience
            ? "Loading audience…"
            : `${audience ?? 0} opted-in recipient${audience === 1 ? "" : "s"}`}
        </div>

        <label className="mt-4 block text-sm font-semibold">Message</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          maxLength={300}
          placeholder="e.g. This week only: 15% off catering orders over $150. Order online at takeout.koshernosh.com."
          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {trimmed.length} chars · ~{segments} segment{segments === 1 ? "" : "s"}
          </span>
          {(willAutoPrefix || willAutoSuffix) && (
            <span>
              {willAutoPrefix && '"The Kosher Nosh: " '}
              {willAutoSuffix && 'and "Reply STOP to opt out." '}
              added automatically
            </span>
          )}
        </div>

        {trimmed && (
          <div className="mt-3 rounded-xl bg-muted/50 p-3 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Preview
            </div>
            <div className="mt-1">{previewBody}</div>
          </div>
        )}

        <button
          onClick={() => setConfirmOpen(true)}
          disabled={!trimmed || sending || loadingAudience || (audience ?? 0) === 0}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-40"
        >
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          {sending ? "Sending…" : `Send to ${audience ?? 0} recipient${audience === 1 ? "" : "s"}`}
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
            <AlertDialogTitle>Send to {audience ?? 0} recipients?</AlertDialogTitle>
            <AlertDialogDescription>
              This sends a real text message to every opted-in customer right now. This can't be
              undone once sent.
              <div className="mt-3 rounded-lg bg-muted/50 p-3 text-sm text-foreground">
                {previewBody}
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
