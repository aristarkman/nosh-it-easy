import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ExternalLink, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sendRefundIssuedSms } from "@/lib/sms.functions";
import { fmt, type CartLine } from "@/lib/order-context";

type Props = {
  open: boolean;
  onClose: () => void;
  order: {
    id: string;
    order_number: string;
    location_id: string;
    customer_name: string;
    customer_phone: string;
    total: number;
    refunded_total: number;
    items: CartLine[];
    created_at: string;
  };
  onRefunded?: () => void;
};

const REASONS = [
  { v: "wrong_item", label: "Wrong item" },
  { v: "missing_item", label: "Missing item" },
  { v: "quality", label: "Quality issue" },
  { v: "late", label: "Too late" },
  { v: "customer_request", label: "Customer request" },
  { v: "duplicate", label: "Duplicate charge" },
  { v: "other", label: "Other" },
];

const IPOSPAYS_PORTAL = "https://portal.ipospays.com/";

type Mode = "full" | "partial" | "items";

export function RefundDialog({ open, onClose, order, onRefunded }: Props) {
  const available = Math.max(0, order.total - (order.refunded_total ?? 0));
  // Void if order is < 12 hours old (likely pre-batch). Otherwise refund.
  const ageHours = (Date.now() - new Date(order.created_at).getTime()) / 36e5;
  const canVoid = ageHours < 12 && (order.refunded_total ?? 0) === 0;

  const [mode, setMode] = useState<Mode>("full");
  const [partialAmount, setPartialAmount] = useState("");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState<string>("customer_request");
  const [notes, setNotes] = useState("");
  const [isVoid, setIsVoid] = useState(canVoid);
  const [reference, setReference] = useState("");
  const [sendSms, setSendSms] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<"form" | "confirm" | "done">("form");

  const computedAmount = useMemo(() => {
    if (mode === "full") return available;
    if (mode === "partial") return Math.max(0, Math.min(available, parseFloat(partialAmount) || 0));
    if (mode === "items") {
      return order.items
        .filter((l) => selectedItems.has(l.lineId))
        .reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    }
    return 0;
  }, [mode, partialAmount, selectedItems, available, order.items]);

  const refundedItemsPayload = useMemo(() => {
    if (mode !== "items") return null;
    return order.items
      .filter((l) => selectedItems.has(l.lineId))
      .map((l) => ({ lineId: l.lineId, name: l.name, quantity: l.quantity, unitPrice: l.unitPrice }));
  }, [mode, selectedItems, order.items]);

  const valid =
    computedAmount > 0 &&
    computedAmount <= available + 0.001 &&
    reason &&
    (mode !== "items" || selectedItems.size > 0);

  const reset = () => {
    setMode("full");
    setPartialAmount("");
    setSelectedItems(new Set());
    setReason("customer_request");
    setNotes("");
    setIsVoid(canVoid);
    setReference("");
    setSendSms(true);
    setStep("form");
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const userId = sess.session?.user.id;
      const userEmail = sess.session?.user.email ?? null;
      if (!userId) {
        toast.error("Not signed in");
        setSubmitting(false);
        return;
      }
      const refundType = isVoid ? "void" : computedAmount >= available - 0.001 ? "full" : "partial";
      const { error } = await supabase.from("order_refunds").insert({
        order_id: order.id,
        location_id: order.location_id,
        amount: computedAmount,
        reason,
        reason_notes: notes || null,
        type: refundType,
        status: "recorded",
        ipospays_reference: reference || null,
        refunded_by: userId,
        refunded_by_email: userEmail,
        items_refunded: refundedItemsPayload,
      });
      if (error) {
        toast.error("Failed to record refund: " + error.message);
        setSubmitting(false);
        return;
      }
      if (sendSms && order.customer_phone) {
        sendRefundIssuedSms({
          data: {
            to: order.customer_phone,
            orderNumber: order.order_number,
            amount: computedAmount,
            customerName: order.customer_name,
            isVoid,
          },
        }).catch((e) => console.error("Refund SMS failed:", e));
      }
      toast.success("Refund recorded");
      setStep("done");
      onRefunded?.();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === "done" ? "Refund recorded" : `Refund order #${order.order_number}`}
          </DialogTitle>
        </DialogHeader>

        {step === "form" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Order total</span>
                <span className="font-semibold">{fmt(order.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Already refunded</span>
                <span className="font-semibold">{fmt(order.refunded_total ?? 0)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-border pt-1">
                <span className="text-muted-foreground">Available to refund</span>
                <span className="font-bold">{fmt(available)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Refund type</Label>
              <div className="grid grid-cols-3 gap-2">
                {(["full", "partial", "items"] as Mode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-wider transition ${
                      mode === m
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground"
                    }`}
                  >
                    {m === "items" ? "By item" : m}
                  </button>
                ))}
              </div>
            </div>

            {mode === "partial" && (
              <div className="space-y-2">
                <Label htmlFor="amt">Amount</Label>
                <Input
                  id="amt"
                  type="number"
                  step="0.01"
                  min="0"
                  max={available}
                  value={partialAmount}
                  onChange={(e) => setPartialAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            )}

            {mode === "items" && (
              <div className="space-y-2">
                <Label>Items to refund</Label>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                  {order.items.map((l) => (
                    <label
                      key={l.lineId}
                      className="flex cursor-pointer items-center justify-between gap-2 rounded p-1.5 text-sm hover:bg-muted"
                    >
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={selectedItems.has(l.lineId)}
                          onCheckedChange={(c) => {
                            const next = new Set(selectedItems);
                            if (c) next.add(l.lineId);
                            else next.delete(l.lineId);
                            setSelectedItems(next);
                          }}
                        />
                        <span>
                          {l.quantity}× {l.name}
                        </span>
                      </div>
                      <span className="font-semibold">{fmt(l.unitPrice * l.quantity)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => (
                    <SelectItem key={r.v} value={r.v}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Anything the team should know"
              />
            </div>

            {canVoid && (
              <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <Checkbox
                  checked={isVoid}
                  onCheckedChange={(c) => setIsVoid(!!c)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-semibold">Void instead of refund</span>
                  <span className="block text-xs text-muted-foreground">
                    Order is less than 12 hours old. A void cancels the auth before settlement (no
                    statement entry, no fee). Use Refund if the batch already closed.
                  </span>
                </span>
              </label>
            )}

            <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
              <div className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <div className="space-y-2">
                  <div>
                    This <strong>records</strong> the refund in the system. You still need to
                    process the actual money movement in the iPOSpays portal.
                  </div>
                  <a
                    href={IPOSPAYS_PORTAL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-amber-700 hover:underline"
                  >
                    Open iPOSpays portal <ExternalLink className="size-3" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-3 text-sm">
            <p>
              Record a {isVoid ? "void" : "refund"} of{" "}
              <strong>{fmt(computedAmount)}</strong> for order #{order.order_number}?
            </p>
            <div className="space-y-2">
              <Label htmlFor="ref">iPOSpays reference # (optional)</Label>
              <Input
                id="ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Paste from portal after processing"
                maxLength={64}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={sendSms} onCheckedChange={(c) => setSendSms(!!c)} />
              Text the customer about this {isVoid ? "void" : "refund"}
            </label>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-3 text-sm">
            <p>
              ✅ Recorded {fmt(computedAmount)} {isVoid ? "void" : "refund"} for order #
              {order.order_number}.
            </p>
            <p className="rounded-lg bg-amber-500/10 p-3">
              <strong>Next step:</strong> Open the iPOSpays portal and process the actual{" "}
              {isVoid ? "void" : "refund"} on the original transaction.
            </p>
            <a
              href={IPOSPAYS_PORTAL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-xs font-bold uppercase tracking-wider text-background"
            >
              Open iPOSpays portal <ExternalLink className="size-3.5" />
            </a>
          </div>
        )}

        <DialogFooter>
          {step === "form" && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button disabled={!valid} onClick={() => setStep("confirm")}>
                Continue
              </Button>
            </>
          )}
          {step === "confirm" && (
            <>
              <Button variant="outline" onClick={() => setStep("form")} disabled={submitting}>
                Back
              </Button>
              <Button onClick={submit} disabled={submitting}>
                {submitting ? "Recording…" : `Record ${isVoid ? "void" : "refund"}`}
              </Button>
            </>
          )}
          {step === "done" && <Button onClick={handleClose}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
