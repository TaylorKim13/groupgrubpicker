import { useEffect, useRef, useState } from "react";
import { distanceKm, kmToMiles, priceLabel, type Center, type Restaurant } from "@/lib/restaurants";

declare global {
  interface Window {
    google?: any;
    __ggMapsReady?: () => void;
  }
}

function restaurantFavicon(name: string, websiteUri?: string) {
  if (!websiteUri) return undefined;
  try {
    const host = new URL(websiteUri).hostname.toLowerCase().replace(/^www\./, "");
    const domainBrand = host.split(".")[0] ?? "";
    const normalize = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    const brand = normalize(domainBrand);
    const restaurant = normalize(name);
    if (brand.length < 4 || !restaurant || (!restaurant.includes(brand) && !brand.includes(restaurant))) return undefined;
    return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(websiteUri)}&sz=64`;
  } catch {
    return undefined;
  }
}

let loader: Promise<void> | null = null;
let placesLoader: Promise<unknown> | null = null;
export async function ensureGoogleMapsLoaded() {
  if (typeof window === "undefined") return Promise.reject();
  if (!window.google?.maps?.Map) {
    const key = import.meta.env["VITE_GOOGLE_MAPS_BROWSER_KEY"];
    if (!key || key === "your_browser_key") {
      throw new Error("Google Maps display is not configured.");
    }
    if (!loader) {
      loader = new Promise((resolve, reject) => {
        window.__ggMapsReady = () => resolve();
        const s = document.createElement("script");
        s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&callback=__ggMapsReady&v=weekly`;
        s.async = true;
        s.onerror = () => reject(new Error("Map failed to load"));
        document.head.appendChild(s);
      });
    }
    await loader;
  }
  if (!placesLoader) placesLoader = window.google.maps.importLibrary("places");
  await placesLoader;
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
  const restaurantMarkers = useRef<Map<string, any>>(new Map());
  const restaurantIcons = useRef<Map<string, { normal: any; selected: any }>>(new Map());
  const info = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    ensureGoogleMapsLoaded()
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
    restaurantMarkers.current.clear();
    restaurantIcons.current.clear();
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
      const faviconUrl = restaurantFavicon(r.name, r.websiteUri);
      const iconFor = (hot: boolean) => {
        const markerSize = hot ? 36 : 30;
        return faviconUrl
          ? {
              url: faviconUrl,
              scaledSize: new g.Size(markerSize, markerSize),
              anchor: new g.Point(markerSize / 2, markerSize / 2),
            }
          : {
              path: g.SymbolPath.CIRCLE,
              scale: hot ? 18 : 14,
              fillColor: r.custom ? "#2b7a4b" : hot ? "#f2b705" : "#e0442c",
              fillOpacity: 1,
              strokeColor: "#222",
              strokeWeight: 2,
            };
      };
      const mk = new g.Marker({
        map: m,
        position: { lat: r.lat, lng: r.lng },
        title: r.name,
        icon: iconFor(false),
        label: faviconUrl ? undefined : { text: priceLabel(r.price), color: "#fff", fontSize: "10px", fontWeight: "700" },
      });
      restaurantMarkers.current.set(r.id, mk);
      restaurantIcons.current.set(r.id, { normal: iconFor(false), selected: iconFor(true) });
      mk.addListener("click", () => {
        const d = distanceKm(center, r).toFixed(1);
        const div = document.createElement("div");
        div.style.cssText = "font-family:Figtree,sans-serif;min-width:160px";
        const h = document.createElement("strong");
        h.textContent = r.name;
        const p = document.createElement("div");
        const price = r.priceUnknown ? "Price unknown" : priceLabel(r.price);
        p.textContent = `${r.cuisine} · ${price} · ${kmToMiles(Number(d)).toFixed(1)} mi`;
        div.append(h, p);
        if (r.websiteUri) {
          const website = document.createElement("a");
          website.href = r.websiteUri;
          website.target = "_blank";
          website.rel = "noreferrer";
          website.textContent = "Restaurant website";
          website.style.cssText = "display:block;margin-top:6px;color:#1967d2;text-decoration:underline";
          div.append(website);
        }
        if (r.google && r.id.startsWith("g_")) {
          const link = document.createElement("a");
          link.href = `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(r.id.slice(2))}`;
          link.target = "_blank";
          link.rel = "noreferrer";
          link.textContent = "Popular times & wait estimates in Google Maps";
          link.style.cssText = "display:block;margin-top:6px;color:#1967d2;text-decoration:underline";
          div.append(link);
        }
        info.current.setContent(div);
        info.current.open({ map: m, anchor: mk });
        onSelect?.(r);
      });
      overlays.current.push(mk);
      bounds.extend({ lat: r.lat, lng: r.lng });
    });
    if (pool.length) m.fitBounds(bounds, 40);
    else m.setCenter(center);
  }, [ready, center.lat, center.lng, radiusKm, pool]);

  useEffect(() => {
    if (!ready) return;
    restaurantMarkers.current.forEach((marker, id) => {
      const icons = restaurantIcons.current.get(id);
      if (icons) marker.setIcon(id === highlight ? icons.selected : icons.normal);
    });
  }, [ready, highlight, pool]);

  if (err) return <div className="grid h-full place-items-center p-6 text-sm text-muted-foreground">{err}</div>;
  return <div ref={el} className="h-full w-full" />;
}
