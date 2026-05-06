import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LOCATIONS } from "@/lib/order-context";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/admin/staff")({
  component: StaffPage,
});

type Assignment = { id: string; user_id: string; location_id: string };
type Role = { id: string; user_id: string; role: "admin" | "staff" };

function StaffPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [userId, setUserId] = useState("");
  const [loc, setLoc] = useState<string>(LOCATIONS[0].id);

  const load = async () => {
    const [{ data: a }, { data: r }] = await Promise.all([
      supabase.from("staff_locations").select("*").order("user_id"),
      supabase.from("user_roles").select("*"),
    ]);
    setAssignments((a ?? []) as Assignment[]);
    setRoles((r ?? []) as Role[]);
  };
  useEffect(() => { load(); }, []);

  const isUuid = (s: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

  const assign = async () => {
    if (!isUuid(userId)) return toast.error("Paste a valid user UUID (from backend → Users)");
    const { error } = await supabase.from("staff_locations").insert({ user_id: userId, location_id: loc });
    if (error) return toast.error(error.message);
    setUserId("");
    load();
  };
  const remove = async (id: string) => {
    await supabase.from("staff_locations").delete().eq("id", id);
    load();
  };

  const grouped = assignments.reduce<Record<string, string[]>>((acc, a) => {
    (acc[a.user_id] ??= []).push(a.location_id);
    return acc;
  }, {});

  const toggleAdmin = async (uid: string, isAdmin: boolean) => {
    if (isAdmin) {
      await supabase.from("user_roles").delete().eq("user_id", uid).eq("role", "admin");
    } else {
      await supabase.from("user_roles").insert({ user_id: uid, role: "admin" });
    }
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl">Staff & access</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Create the user account in <strong>Cloud → Users</strong>, copy the user UUID, then assign it to a location here.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Assign location</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <input
            placeholder="User UUID"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="rounded border border-border bg-background px-2 py-2 text-sm sm:col-span-2"
          />
          <select value={loc} onChange={(e) => setLoc(e.target.value)} className="rounded border border-border bg-background px-2 py-2 text-sm">
            {LOCATIONS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <button onClick={assign} className="rounded-full bg-primary px-4 py-2 text-xs font-black uppercase tracking-wider text-primary-foreground hover:opacity-90">
            Assign
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-4 py-2">User ID</th><th className="px-4 py-2">Locations</th><th className="px-4 py-2">Admin</th><th /></tr>
          </thead>
          <tbody>
            {Object.keys(grouped).length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No staff assigned yet.</td></tr>
            )}
            {Object.entries(grouped).map(([uid, locs]) => {
              const isAdmin = roles.some((r) => r.user_id === uid && r.role === "admin");
              return (
                <tr key={uid} className="border-t border-border align-top">
                  <td className="px-4 py-2 font-mono text-xs">{uid}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {locs.map((id) => {
                        const a = assignments.find((x) => x.user_id === uid && x.location_id === id)!;
                        return (
                          <span key={id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                            {LOCATIONS.find((l) => l.id === id)?.name ?? id}
                            <button onClick={() => remove(a.id)} className="text-muted-foreground hover:text-destructive">
                              <Trash2 className="size-3" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => toggleAdmin(uid, isAdmin)}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${isAdmin ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}
                    >
                      {isAdmin ? "Admin" : "Make admin"}
                    </button>
                  </td>
                  <td />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
