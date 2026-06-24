/// <reference types="google.maps" />
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LOCATIONS, fmt } from "@/lib/order-context";
import { toast } from "sonner";
import { Trash2, Pencil, Plus, Save, X } from "lucide-react";
import { loadGoogleMaps } from "@/lib/google-maps-loader";
import type { LatLng } from "@/lib/point-in-polygon";

export const Route = createFileRoute("/admin/zones")({
  component: ZonesPage,
});

type Zone = {
  id: string;
  location_id: string;
  name: string;
  fee: number;
  minimum: number;
  color: string;
  polygon: LatLng[];
  sort_order: number;
  active: boolean;
};

const PALETTE = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

// Rough centers for the two known stores; map will recenter to drawn polygons if any
const LOCATION_CENTERS: Record<string, { lat: number; lng: number }> = {
  "glen-rock": { lat: 40.9626, lng: -74.1326 },
  "cresskill": { lat: 40.9412, lng: -73.9594 },
};

function ZonesPage() {
  const [activeLoc, setActiveLoc] = useState<string>(LOCATIONS[0].id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl">Delivery zones</h2>
        <div className="flex gap-2">
          {LOCATIONS.map((l) => (
            <button
              key={l.id}
              onClick={() => setActiveLoc(l.id)}
              className={`rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                activeLoc === l.id
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {l.name}
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Draw delivery areas directly on the map. Each zone has its own delivery fee and minimum
        order. Customer addresses are matched to the smallest containing zone at checkout.
      </p>
      <ZoneEditor key={activeLoc} locationId={activeLoc} />
    </div>
  );
}

function ZoneEditor({ locationId }: { locationId: string }) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const drawingMgr = useRef<google.maps.drawing.DrawingManager | null>(null);
  const polysRef = useRef<Map<string, google.maps.Polygon>>(new Map());

  const [zones, setZones] = useState<Zone[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editFee, setEditFee] = useState("");
  const [editMin, setEditMin] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [drawing, setDrawing] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("delivery_zone_polygons")
      .select("*")
      .eq("location_id", locationId)
      .order("sort_order");
    if (error) {
      toast.error(error.message);
      return;
    }
    setZones(
      (data ?? []).map((d) => ({
        id: d.id as string,
        location_id: d.location_id as string,
        name: d.name as string,
        fee: Number(d.fee),
        minimum: Number(d.minimum),
        color: d.color as string,
        polygon: d.polygon as LatLng[],
        sort_order: d.sort_order as number,
        active: d.active as boolean,
      })),
    );
  };

  // Init map
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !mapRef.current) return;
        const center = LOCATION_CENTERS[locationId] ?? { lat: 40.9, lng: -74.0 };
        const map = new g.maps.Map(mapRef.current, {
          center,
          zoom: 12,
          streetViewControl: false,
          mapTypeControl: true,
          fullscreenControl: true,
        });
        mapInstance.current = map;

        const dm = new g.maps.drawing.DrawingManager({
          drawingControl: false,
          polygonOptions: {
            fillOpacity: 0.25,
            strokeWeight: 2,
            editable: true,
            draggable: false,
          },
        });
        dm.setMap(map);
        drawingMgr.current = dm;

        g.maps.event.addListener(dm, "polygoncomplete", (poly: google.maps.Polygon) => {
          dm.setDrawingMode(null);
          setDrawing(false);
          void onPolygonDrawn(poly);
        });

        if (!g.maps.drawing?.OverlayType?.POLYGON) {
          throw new Error("Google Maps polygon drawing mode is unavailable");
        }
        setMapReady(true);
      })
      .catch((e) => toast.error(`Map load failed: ${e.message}`));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  // Render polygons whenever zones change
  useEffect(() => {
    if (!mapReady || !mapInstance.current || !window.google) return;
    const map = mapInstance.current;

    // Remove polygons no longer present
    polysRef.current.forEach((poly, id) => {
      if (!zones.find((z) => z.id === id)) {
        poly.setMap(null);
        polysRef.current.delete(id);
      }
    });

    // Add/update polygons
    const bounds = new google.maps.LatLngBounds();
    zones.forEach((z) => {
      const path = z.polygon.map((p) => ({ lat: p.lat, lng: p.lng }));
      path.forEach((p) => bounds.extend(p));
      let poly = polysRef.current.get(z.id);
      if (!poly) {
        poly = new google.maps.Polygon({
          paths: path,
          strokeColor: z.color,
          fillColor: z.color,
          fillOpacity: editingId === z.id ? 0.35 : 0.2,
          strokeWeight: 2,
          editable: editingId === z.id,
          map,
        });
        polysRef.current.set(z.id, poly);
        google.maps.event.addListener(poly, "click", () => beginEdit(z.id));
        // persist edits when path changes
        const path0 = poly.getPath();
        const save = () => void persistGeometry(z.id);
        google.maps.event.addListener(path0, "set_at", save);
        google.maps.event.addListener(path0, "insert_at", save);
        google.maps.event.addListener(path0, "remove_at", save);
      } else {
        poly.setPath(path);
        poly.setOptions({
          strokeColor: z.color,
          fillColor: z.color,
          editable: editingId === z.id,
          fillOpacity: editingId === z.id ? 0.35 : 0.2,
        });
      }
    });

    if (zones.length > 0 && !bounds.isEmpty()) {
      map.fitBounds(bounds, 60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones, mapReady, editingId]);

  const beginEdit = (id: string) => {
    const z = zones.find((x) => x.id === id);
    if (!z) return;
    setEditingId(id);
    setEditName(z.name);
    setEditFee(String(z.fee));
    setEditMin(String(z.minimum));
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const onPolygonDrawn = async (poly: google.maps.Polygon) => {
    const path = poly
      .getPath()
      .getArray()
      .map((p) => ({ lat: p.lat(), lng: p.lng() }));
    poly.setMap(null); // remove the temp polygon; we'll re-render from state

    const nextIdx = zones.length;
    const color = PALETTE[nextIdx % PALETTE.length];
    const { data, error } = await supabase
      .from("delivery_zone_polygons")
      .insert({
        location_id: locationId,
        name: `Zone ${nextIdx + 1}`,
        fee: 4.99,
        minimum: 20,
        color,
        polygon: path,
        sort_order: nextIdx,
      })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Zone added");
    await load();
    if (data) beginEdit(data.id as string);
  };

  const persistGeometry = async (id: string) => {
    const poly = polysRef.current.get(id);
    if (!poly) return;
    const path = poly
      .getPath()
      .getArray()
      .map((p) => ({ lat: p.lat(), lng: p.lng() }));
    const { error } = await supabase
      .from("delivery_zone_polygons")
      .update({ polygon: path })
      .eq("id", id);
    if (error) toast.error(error.message);
  };

  const saveDetails = async () => {
    if (!editingId) return;
    const fee = parseFloat(editFee) || 0;
    const min = parseFloat(editMin) || 0;
    const name = editName.trim() || "Zone";
    const { error } = await supabase
      .from("delivery_zone_polygons")
      .update({ name, fee, minimum: min })
      .eq("id", editingId);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    setEditingId(null);
    await load();
  };

  const removeZone = async (id: string) => {
    if (!confirm("Delete this zone?")) return;
    const poly = polysRef.current.get(id);
    if (poly) {
      poly.setMap(null);
      polysRef.current.delete(id);
    }
    const { error } = await supabase.from("delivery_zone_polygons").delete().eq("id", id);
    if (error) return toast.error(error.message);
    if (editingId === id) setEditingId(null);
    await load();
  };

  const startDrawing = () => {
    if (!drawingMgr.current || !window.google) return;
    setDrawing(true);
    drawingMgr.current.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
  };

  const stopDrawing = () => {
    if (!drawingMgr.current) return;
    drawingMgr.current.setDrawingMode(null);
    setDrawing(false);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Map
          </div>
          {drawing ? (
            <button
              onClick={stopDrawing}
              className="inline-flex items-center gap-1.5 rounded-full bg-destructive px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-destructive-foreground"
            >
              <X className="size-3.5" /> Cancel drawing
            </button>
          ) : (
            <button
              onClick={startDrawing}
              disabled={!mapReady}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-50"
            >
              <Plus className="size-3.5" /> Draw new zone
            </button>
          )}
        </div>
        <div ref={mapRef} className="h-[560px] w-full" />
        {drawing && (
          <div className="border-t border-border bg-primary/5 px-4 py-2 text-xs text-foreground">
            Click on the map to drop polygon points. Click the first point again to close the
            shape.
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Zones for {LOCATIONS.find((l) => l.id === locationId)?.name}
          </div>
          {zones.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No zones yet. Click <span className="font-semibold">Draw new zone</span> to outline
              a delivery area on the map.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {zones.map((z) => {
                const isEditing = editingId === z.id;
                return (
                  <li
                    key={z.id}
                    className={`rounded-xl border p-3 text-sm transition ${
                      isEditing ? "border-primary bg-primary/5" : "border-border bg-background"
                    }`}
                  >
                    {isEditing ? (
                      <div className="space-y-2">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Zone name"
                          className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-xs">
                            <span className="text-muted-foreground">Fee ($)</span>
                            <input
                              type="number"
                              step="0.01"
                              value={editFee}
                              onChange={(e) => setEditFee(e.target.value)}
                              className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                            />
                          </label>
                          <label className="text-xs">
                            <span className="text-muted-foreground">Min ($)</span>
                            <input
                              type="number"
                              step="0.01"
                              value={editMin}
                              onChange={(e) => setEditMin(e.target.value)}
                              className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                            />
                          </label>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            onClick={saveDetails}
                            className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary-foreground"
                          >
                            <Save className="size-3" /> Save
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-bold uppercase tracking-wider"
                          >
                            Done
                          </button>
                          <button
                            onClick={() => removeZone(z.id)}
                            className="ml-auto inline-flex items-center gap-1 rounded-full border border-destructive/40 px-3 py-1 text-xs font-bold uppercase tracking-wider text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="size-3" /> Delete
                          </button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Drag the polygon vertices on the map to reshape this zone.
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <span
                          className="size-4 shrink-0 rounded"
                          style={{ background: z.color }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold">{z.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {fmt(z.fee)} fee · {fmt(z.minimum)} min
                          </div>
                        </div>
                        <button
                          onClick={() => beginEdit(z.id)}
                          className="rounded-full border border-border p-1.5 text-muted-foreground hover:text-foreground"
                          title="Edit"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          onClick={() => removeZone(z.id)}
                          className="rounded-full border border-border p-1.5 text-muted-foreground hover:text-destructive"
                          title="Delete"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
