import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  importMarketingContacts,
  getMarketingOverview,
  createMarketingCampaign,
  setMarketingCampaignStatus,
  runMarketingCampaignBatchNow,
  sendMarketingCampaignTest,
} from "@/lib/marketing-contacts.functions";
import {
  Loader2,
  Upload,
  Users,
  AlertCircle,
  CheckCircle2,
  Play,
  Pause,
  Send,
  Mail,
} from "lucide-react";

export const Route = createFileRoute("/admin/marketing-contacts")({
  head: () => ({ meta: [{ title: "Marketing Contacts — Admin" }] }),
  component: MarketingContactsPage,
});

type ParsedContact = {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  lastOrderAt?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+()\d][\d\s().+-]{6,}$/;

// Tolerant parser: handles CSV, tab-separated, and plain space-separated
// GloriaFood exports ("First name  Last name  Email  Phone"). It locates the
// email token on each line and infers names before it, phone after it.
function parseContacts(text: string): ParsedContact[] {
  const out: ParsedContact[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const cells = (line.includes(",") ? line.split(",") : line.split(/\t+|\s{2,}|\s+/))
      .map((c) => c.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);

    const emailIdx = cells.findIndex((c) => EMAIL_RE.test(c));
    if (emailIdx === -1) continue; // header row or junk

    const email = cells[emailIdx].toLowerCase();
    const before = cells.slice(0, emailIdx);
    const after = cells.slice(emailIdx + 1);
    const phone = after.find((c) => PHONE_RE.test(c.replace(/\s+/g, " ")));
    const dateCell = after.find((c) => /\d{4}/.test(c) && !PHONE_RE.test(c) && Date.parse(c));

    out.push({
      email,
      firstName: before[0],
      lastName: before.slice(1).join(" ") || undefined,
      phone: phone?.replace(/\s+/g, " "),
      lastOrderAt: dateCell,
    });
  }
  // Dedupe within the paste itself.
  const seen = new Set<string>();
  return out.filter((c) => (seen.has(c.email) ? false : (seen.add(c.email), true)));
}

const RAMP_PRESETS: Record<string, number[]> = {
  conservative: [50, 100, 200, 400, 600, 800, 1000, 1000, 1000, 1000],
  standard: [100, 200, 400, 800, 1500, 3000],
  // Carriers flag sudden SMS volume much faster than mailbox providers.
  sms: [25, 50, 100, 200, 300, 400, 500, 500, 500, 500],
};


function MarketingContactsPage() {
  const [token, setToken] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [pasteText, setPasteText] = useState("");
  const parsed = useMemo(() => parseContacts(pasteText), [pasteText]);

  const [overview, setOverview] = useState<any | null>(null);

  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [contentType, setContentType] = useState<"text" | "html">("text");
  const [ctaLabel, setCtaLabel] = useState("Order Now");
  const [ctaUrl, setCtaUrl] = useState("https://takeout.koshernosh.com");
  const [rampKey, setRampKey] = useState<"conservative" | "standard" | "sms">("conservative");


  const doImport = useServerFn(importMarketingContacts);
  const doOverview = useServerFn(getMarketingOverview);
  const doCreate = useServerFn(createMarketingCampaign);
  const doStatus = useServerFn(setMarketingCampaignStatus);
  const doRunNow = useServerFn(runMarketingCampaignBatchNow);
  const doTest = useServerFn(sendMarketingCampaignTest);

  async function withToken<T>(fn: (t: string) => Promise<T>) {
    const { data: sess } = await supabase.auth.getSession();
    const t = sess.session?.access_token;
    if (!t) {
      setErr("Please sign in again.");
      return null;
    }
    setToken(t);
    return fn(t);
  }

  async function refresh() {
    setErr(null);
    await withToken(async (t) => {
      const res = await doOverview({ data: { accessToken: t } });
      if (res.ok) setOverview(res);
      else setErr(res.error ?? "Could not load");
    });
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleImport() {
    setBusy(true);
    setErr(null);
    setNotice(null);
    try {
      await withToken(async (t) => {
        const res = await doImport({
          data: { accessToken: t, source: "gloriafood", contacts: parsed },
        });
        if (!res.ok) {
          setErr(res.error ?? "Import failed");
          return;
        }
        setNotice(
          `Imported ${res.inserted} new contacts. Skipped ${res.alreadyStored} already stored, ${res.duplicates} duplicates, ${res.roleAddresses} role addresses (info@, support@ …).`,
        );
        setPasteText("");
        await refresh();
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    setBusy(true);
    setErr(null);
    setNotice(null);
    try {
      await withToken(async (t) => {
        const res = await doCreate({
          data: {
            accessToken: t,
            channel,
            name: name.trim(),
            subject: channel === "sms" ? undefined : subject.trim(),
            message: message.trim(),
            contentType: channel === "sms" ? "text" : contentType,
            ctaLabel: channel === "sms" ? undefined : ctaLabel.trim() || undefined,
            ctaUrl: channel === "sms" ? undefined : ctaUrl.trim() || undefined,
            ramp: RAMP_PRESETS[channel === "sms" ? "sms" : rampKey],
          },
        });

        if (!res.ok) {
          setErr(res.error ?? "Could not create campaign");
          return;
        }
        setNotice("Campaign saved as a draft. Send yourself a test, then press Start.");
        setName("");
        setSubject("");
        setMessage("");
        await refresh();
      });
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(id: string, status: "running" | "paused") {
    setBusy(true);
    try {
      await withToken(async (t) => {
        const res = await doStatus({ data: { accessToken: t, campaignId: id, status } });
        if (!res.ok) setErr(res.error ?? "Could not update campaign");
        await refresh();
      });
    } finally {
      setBusy(false);
    }
  }

  async function runNow(id: string) {
    setBusy(true);
    setNotice(null);
    try {
      await withToken(async (t) => {
        const res = await doRunNow({ data: { accessToken: t, campaignId: id } });
        if (!res.ok) setErr(res.error ?? "Batch failed");
        else setNotice(`Batch done — ${res.sent} sent, ${res.failed} failed.`);
        await refresh();
      });
    } finally {
      setBusy(false);
    }
  }

  async function testSend(c: any) {
    const isSms = c.channel === "sms";
    const to = window.prompt(
      isSms
        ? "Send a test text to which phone number? (e.g. 2015550100)"
        : "Send a test copy to which email address?",
    );
    if (!to) return;
    setBusy(true);
    setErr(null);
    setNotice(null);
    try {
      await withToken(async (t) => {
        const res = await doTest({ data: { accessToken: t, campaignId: c.id, to: to.trim() } });
        if (!res.ok) setErr(res.error ?? "Test send failed");
        else setNotice(`Test ${isSms ? "text" : "email"} sent to ${to.trim()}.`);
      });
    } finally {
      setBusy(false);
    }
  }

  const stats = overview?.contacts;
  const campaigns: any[] = overview?.campaigns ?? [];
  const isSmsDraft = channel === "sms";
  const canCreate =
    name.trim() && message.trim() && (isSmsDraft || subject.trim()) && !busy;


  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">Marketing Contacts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Import your GloriaFood customer list once, then send it in small daily batches so your
          sending domain warms up instead of getting blacklisted.
        </p>
      </div>

      {notice && (
        <div className="flex items-start gap-2 rounded-lg bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-300">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}
      {err && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span className="break-all">{err}</span>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-4">
        {[
          ["Total contacts", stats?.total],
          ["Sendable", stats?.sendable],
          ["Unsubscribed", stats?.unsubscribed],
          ["Bounced", stats?.bounced],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-border bg-card p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {label}
            </div>
            <div className="mt-1 text-2xl font-bold">{value ?? "—"}</div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 font-display text-lg">
          <Upload className="size-4" /> Import contacts
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Paste the export straight from GloriaFood — CSV, tabs, or plain columns all work. Existing
          contacts, duplicates, and role addresses are skipped automatically, and anyone who
          unsubscribes stays unsubscribed on future imports.
        </p>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={8}
          aria-label="Contact list to import"
          placeholder={"First name  Last name  Email  Phone\nJane Doe jane@example.com (201) 555-0100"}
          className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-2.5 font-mono text-xs outline-none focus:border-primary"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="text-sm text-muted-foreground">
            <Users className="mr-1 inline size-4" />
            {parsed.length} valid contact{parsed.length === 1 ? "" : "s"} detected
          </div>
          <button
            onClick={handleImport}
            disabled={busy || parsed.length === 0}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Import {parsed.length || ""}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 font-display text-lg">
          <Mail className="size-4" /> New drip campaign
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          The campaign sends one capped batch per day, most recent customers first. Start with a
          re-engagement message ("You ordered from us before — here's our new site"), not a promo.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground">
              Campaign name (internal)
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="GloriaFood re-engagement"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Our new online ordering site is live"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <label className="block text-sm font-semibold">Message</label>
          <div className="flex gap-1 rounded-full bg-muted p-0.5 text-xs font-bold">
            {(["text", "html"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setContentType(t)}
                className={`rounded-full px-3 py-1 ${contentType === t ? "bg-background shadow-sm" : "text-muted-foreground"}`}
              >
                {t === "text" ? "Plain text" : "Custom HTML"}
              </button>
            ))}
          </div>
        </div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={7}
          aria-label="Email message"
          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 font-mono text-xs outline-none focus:border-primary"
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground">Button text</label>
            <input
              value={ctaLabel}
              onChange={(e) => setCtaLabel(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground">Button link</label>
            <input
              value={ctaUrl}
              onChange={(e) => setCtaUrl(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground">Warm-up ramp</label>
            <select
              value={rampKey}
              onChange={(e) => setRampKey(e.target.value as "conservative" | "standard")}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="conservative">Conservative — 50/100/200/400/600/800/1000…</option>
              <option value="standard">Standard — 100/200/400/800/1500/3000</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleCreate}
          disabled={!canCreate}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Save campaign
        </button>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-lg">Campaigns</h2>
        {campaigns.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No campaigns yet.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {campaigns.map((c) => {
              const ramp: number[] = c.ramp ?? [];
              const todayCap = ramp[Math.min(c.day_index, ramp.length - 1)] ?? 0;
              return (
                <div key={c.id} className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-bold">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.subject}</div>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        c.status === "running"
                          ? "bg-green-500/15 text-green-700 dark:text-green-300"
                          : c.status === "completed"
                            ? "bg-muted text-muted-foreground"
                            : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Day {c.day_index + 1} of ramp · today's cap {todayCap} · {c.sentCount} sent
                    {c.failedCount > 0 && ` · ${c.failedCount} failed`}
                    {c.last_run_on && ` · last batch ${c.last_run_on}`}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {c.status !== "completed" &&
                      (c.status === "running" ? (
                        <button
                          onClick={() => changeStatus(c.id, "paused")}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-1.5 text-xs font-bold disabled:opacity-40"
                        >
                          <Pause className="size-3.5" /> Pause
                        </button>
                      ) : (
                        <button
                          onClick={() => changeStatus(c.id, "running")}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-40"
                        >
                          <Play className="size-3.5" /> Start daily sending
                        </button>
                      ))}
                    <button
                      onClick={() => testSend(c.id)}
                      disabled={busy}
                      className="rounded-full border border-border px-4 py-1.5 text-xs font-bold disabled:opacity-40"
                    >
                      Send test
                    </button>
                    {c.status === "running" && (
                      <button
                        onClick={() => runNow(c.id)}
                        disabled={busy}
                        className="rounded-full border border-border px-4 py-1.5 text-xs font-bold disabled:opacity-40"
                      >
                        Run today's batch now
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
