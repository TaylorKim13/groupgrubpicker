import { useEffect, useRef, useState } from "react";
import { distanceKm, priceLabel, type Center, type Restaurant } from "@/lib/restaurants";

declare global {
  interface Window {
    google?: any;
    __ggMapsReady?: () => void;
  }
}

let loader: Promise<void> | null = null;
function loadMaps() {
  if (typeof window === "undefined") return Promise.reject();
  if (window.google?.maps?.Map) return Promise.resolve();
  if (!loader) {
    loader = new Promise((resolve, reject) => {
      window.__ggMapsReady = () => resolve();
      const env = import.meta.env as Record<string, string>;
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?key=${env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"]}&loading=async&callback=__ggMapsReady&channel=${env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID"]}`;
      s.async = true;
      s.onerror = () => reject(new Error("Map failed to load"));
      document.head.appendChild(s);
    });
  }
  return loader;
}

export function RestaurantMap({
  center,
  radiusKm,
  pool,
  highlight,
  onSelect,
}: {
  center: Center;
  radiusKm: number;
  pool: Restaurant[];
  highlight?: string | null;
  onSelect?: (r: Restaurant) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const overlays = useRef<any[]>([]);
  const info = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    loadMaps()
      .then(() => {
        if (!el.current || map.current) return;
        const g = window.google.maps;
        map.current = new g.Map(el.current, {
          center,
          zoom: 13,
          clickableIcons: false,
          disableDefaultUI: true,
          zoomControl: true,
          styles: [{ featureType: "poi", stylers: [{ visibility: "off" }] }],
        });
        info.current = new g.InfoWindow();
        setReady(true);
      })
      .catch((e) => setErr(e?.message ?? "Map failed to load"));
  }, []);

  useEffect(() => {
    if (!ready) return;
    const g = window.google.maps;
    overlays.current.forEach((o) => o.setMap(null));
    overlays.current = [];
    const m = map.current;
    overlays.current.push(
      new g.Marker({
        map: m,
        position: center,
        title: "Search center",
        icon: { path: g.SymbolPath.CIRCLE, scale: 9, fillColor: "#222", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3 },
        zIndex: 999,
      }),
      new g.Circle({
        map: m,
        center,
        radius: radiusKm * 1000,
        fillColor: "#e0442c",
        fillOpacity: 0.06,
        strokeColor: "#e0442c",
        strokeOpacity: 0.6,
        strokeWeight: 2,
        clickable: false,
      }),
    );
    const bounds = new g.LatLngBounds();
    bounds.extend(center);
    pool.forEach((r) => {
      const hot = r.id === highlight;
      const mk = new g.Marker({
        map: m,
        position: { lat: r.lat, lng: r.lng },
        title: r.name,
        label: { text: priceLabel(r.price), color: "#fff", fontSize: "10px", fontWeight: "700" },
        icon: {
          path: g.SymbolPath.CIRCLE,
          scale: hot ? 18 : 14,
          fillColor: r.custom ? "#2b7a4b" : hot ? "#f2b705" : "#e0442c",
          fillOpacity: 1,
          strokeColor: "#222",
          strokeWeight: 2,
        },
      });
      mk.addListener("click", () => {
        const d = distanceKm(center, r).toFixed(1);
        const div = document.createElement("div");
        div.style.cssText = "font-family:Figtree,sans-serif;min-width:160px";
        const h = document.createElement("strong");
        h.textContent = r.name;
        const p = document.createElement("div");
        p.textContent = `${r.cuisine} · ${priceLabel(r.price)} · ${d} km · ~${r.wait} min wait`;
        div.append(h, p);
        info.current.setContent(div);
        info.current.open({ map: m, anchor: mk });
        onSelect?.(r);
      });
      overlays.current.push(mk);
      bounds.extend({ lat: r.lat, lng: r.lng });
    });
    if (pool.length) m.fitBounds(bounds, 40);
    else m.setCenter(center);
  }, [ready, center.lat, center.lng, radiusKm, pool, highlight]);

  if (err) return <div className="grid h-full place-items-center p-6 text-sm text-muted-foreground">{err}</div>;
  return <div ref={el} className="h-full w-full" />;
}
