/// <reference types="google.maps" />
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
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
  cresskill: { lat: 40.9412, lng: -73.9594 },
};

const TILE_SIZE = 256;

function latLngToWorld(point: LatLng) {
  const siny = Math.min(Math.max(Math.sin((point.lat * Math.PI) / 180), -0.9999), 0.9999);
  return {
    x: TILE_SIZE * (0.5 + point.lng / 360),
    y: TILE_SIZE * (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)),
  };
}

function worldToLatLng(point: { x: number; y: number }): LatLng {
  const lng = (point.x / TILE_SIZE - 0.5) * 360;
  const latRadians = Math.atan(Math.sinh(Math.PI - (2 * Math.PI * point.y) / TILE_SIZE));
  return { lat: (latRadians * 180) / Math.PI, lng };
}

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
        Draw delivery areas directly on the map. Each zone has its own delivery fee and minimum order. Customer
        addresses are matched to the smallest containing zone at checkout.
      </p>
      <ZoneEditor key={activeLoc} locationId={activeLoc} />
    </div>
  );
}

function ZoneEditor({ locationId }: { locationId: string }) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const drawingListeners = useRef<google.maps.MapsEventListener[]>([]);
  const draftMarkers = useRef<google.maps.Marker[]>([]);
  const draftLine = useRef<google.maps.Polyline | null>(null);
  const draftPoints = useRef<LatLng[]>([]);
  const draftColor = useRef(PALETTE[0]);
  const polysRef = useRef<Map<string, google.maps.Polygon>>(new Map());

  const [zones, setZones] = useState<Zone[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editFee, setEditFee] = useState("");
  const [editMin, setEditMin] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [draftPointCount, setDraftPointCount] = useState(0);
  const [draftOverlayPoints, setDraftOverlayPoints] = useState<{ x: number; y: number }[]>([]);

  const clearDraft = () => {
    drawingListeners.current.forEach((listener) => listener.remove());
    drawingListeners.current = [];
    draftMarkers.current.forEach((marker) => marker.setMap(null));
    draftMarkers.current = [];
    draftLine.current?.setMap(null);
    draftLine.current = null;
    draftPoints.current = [];
    setDraftPointCount(0);
    setDraftOverlayPoints([]);
  };

  const startPolygonDrawing = (g: typeof google = window.google) => {
    clearDraft();
    if (!mapInstance.current || !g?.maps?.Polyline) return;

    const map = mapInstance.current;
    const nextIdx = zones.length;
    const color = PALETTE[nextIdx % PALETTE.length];
    draftColor.current = color;
    const line = new g.maps.Polyline({
      map,
      path: [],
      strokeColor: color,
      strokeOpacity: 0.9,
      strokeWeight: 2,
    });
    draftLine.current = line;
    map.setOptions({ draggableCursor: "crosshair" });
  };

  const addDraftPoint = (point: LatLng) => {
    const points = [...draftPoints.current, point];
    draftPoints.current = points;
    setDraftPointCount(points.length);
    draftLine.current?.setPath(points);

    if (window.google?.maps?.Marker && mapInstance.current) {
      const marker = new window.google.maps.Marker({
        map: mapInstance.current,
        position: point,
        label: String(points.length),
        title: "Zone point",
      });
      draftMarkers.current.push(marker);
    }
  };

  const finishDraftDrawing = () => {
    if (draftPoints.current.length < 3) {
      toast.error("Add at least 3 points to create a zone");
      return;
    }
    const path = [...draftPoints.current];
    clearDraft();
    mapInstance.current?.setOptions({ draggableCursor: null });
    setDrawing(false);
    void createZoneFromPath(path);
  };

  const clientPointToLatLng = (clientX: number, clientY: number): LatLng | null => {
    const map = mapInstance.current;
    const el = mapRef.current;
    const center = map?.getCenter();
    const zoom = map?.getZoom();
    if (!el) return null;

    const rect = el.getBoundingClientRect();
    const scale = 2 ** (zoom ?? 12);
    const fallbackCenter = LOCATION_CENTERS[locationId] ?? { lat: 40.9, lng: -74.0 };
    const worldCenter = latLngToWorld(center ? { lat: center.lat(), lng: center.lng() } : fallbackCenter);
    const worldPoint = {
      x: worldCenter.x + (clientX - rect.left - rect.width / 2) / scale,
      y: worldCenter.y + (clientY - rect.top - rect.height / 2) / scale,
    };
    return worldToLatLng(worldPoint);
  };

  const onDraftOverlayPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const point = clientPointToLatLng(e.clientX, e.clientY);
    if (!point) return toast.error("Map is still loading");
    const rect = e.currentTarget.getBoundingClientRect();
    setDraftOverlayPoints((prev) => [...prev, { x: e.clientX - rect.left, y: e.clientY - rect.top }]);
    addDraftPoint(point);
  };

  const onDraftOverlayDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    finishDraftDrawing();
  };

  const stopPolygonDrawing = () => {
    clearDraft();
    mapInstance.current?.setOptions({ draggableCursor: null });
    setDrawing(false);
  };

  useEffect(() => {
    return () => {
      clearDraft();
      mapInstance.current?.setOptions({ draggableCursor: null });
    };
  }, []);

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

        // Draw 9-mile dashed radius boundary

        const radiusMeters = 9 * 1609.34;
        const circlePoints: google.maps.LatLngLiteral[] = [];
        for (let i = 0; i <= 360; i += 2) {
          const point = google.maps.geometry.spherical.computeOffset(
            new google.maps.LatLng(center.lat, center.lng),
            radiusMeters,
            i,
          );
          circlePoints.push({ lat: point.lat(), lng: point.lng() });
        }
        new google.maps.Polyline({
          map,
          path: circlePoints,
          strokeColor: "#6b7280",
          strokeOpacity: 0,
          strokeWeight: 3,
          icons: [
            {
              icon: {
                path: "M 0,-1 0,1",
                strokeOpacity: 0.7,
                scale: 3,
              },
              offset: "0",
              repeat: "16px",
            },
          ],
        });

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
      try {
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
          // Re-attach path listeners since setPath replaces the path object
          const newPath = poly.getPath();
          const save = () => void persistGeometry(z.id);
          google.maps.event.clearListeners(newPath, "set_at");
          google.maps.event.clearListeners(newPath, "insert_at");
          google.maps.event.clearListeners(newPath, "remove_at");
          google.maps.event.addListener(newPath, "set_at", save);
          google.maps.event.addListener(newPath, "insert_at", save);
          google.maps.event.addListener(newPath, "remove_at", save);
        }
      } catch (e) {
        polysRef.current.get(z.id)?.setMap(null);
        polysRef.current.delete(z.id);
        console.warn("Unable to render delivery zone on the map", e);
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

  const createZoneFromPath = async (path: LatLng[]) => {
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
    const { error } = await supabase.from("delivery_zone_polygons").update({ polygon: path }).eq("id", id);
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
    if (!mapInstance.current || !window.google) {
      toast.error("Map is still loading, please wait");
      return;
    }
    setDrawing(true);
    try {
      startPolygonDrawing(window.google);
    } catch (e) {
      console.warn("Map drawing overlay unavailable; using click capture only", e);
    }
  };

  const stopDrawing = () => {
    stopPolygonDrawing();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Map</div>
          {drawing ? (
            <div className="flex gap-2">
              <button
                onClick={finishDraftDrawing}
                disabled={draftPointCount < 3}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="size-3.5" /> Finish zone
              </button>
              <button
                onClick={stopDrawing}
                className="inline-flex items-center gap-1.5 rounded-full bg-destructive px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-destructive-foreground"
              >
                <X className="size-3.5" /> Cancel drawing
              </button>
            </div>
          ) : (
            <button
              onClick={startDrawing}
              disabled={!mapReady || !mapInstance.current}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-foreground"
            >
              <Plus className="size-3.5" /> {mapReady ? "Draw new zone" : "Loading map…"}
            </button>
          )}
        </div>
        <div className="relative h-[560px] w-full">
          <div ref={mapRef} className="h-full w-full" />
          {drawing && (
            <div
              className="absolute inset-0 z-[1000001] block cursor-crosshair bg-transparent"
              role="button"
              tabIndex={0}
              aria-label="Click map points for delivery zone"
              onPointerDown={onDraftOverlayPointerDown}
              onDoubleClick={onDraftOverlayDoubleClick}
            >
              <svg className="pointer-events-none absolute inset-0 h-full w-full">
                {draftOverlayPoints.length > 1 && (
                  <polyline
                    points={draftOverlayPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke={draftColor.current}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
                {draftOverlayPoints.map((p, i) => (
                  <g key={`${p.x}-${p.y}-${i}`}>
                    <circle cx={p.x} cy={p.y} r="10" fill={draftColor.current} stroke="white" strokeWidth="2" />
                    <text x={p.x} y={p.y + 4} textAnchor="middle" className="fill-white text-[10px] font-bold">
                      {i + 1}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          )}
        </div>
        {drawing && (
          <div className="border-t border-border bg-primary/5 px-4 py-2 text-xs text-foreground">
            Click on the map to drop polygon points, then click Finish zone. Points added: {draftPointCount}.
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
              No zones yet. Click <span className="font-semibold">Draw new zone</span> to outline a delivery area on the
              map.
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
                        <span className="size-4 shrink-0 rounded" style={{ background: z.color }} />
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
