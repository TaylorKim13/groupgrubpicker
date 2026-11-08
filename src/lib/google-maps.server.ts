export async function googleMapsRequest(
  path: string,
  init: RequestInit & { fieldMask?: string } = {},
) {
  const apiKey = process.env["GOOGLE_MAPS_API_KEY"] || process.env["MAPS_API"];
  if (!apiKey) throw new Error("Google Maps is not configured on the server");

  const { fieldMask, ...request } = init;
  const headers = new Headers(request.headers);
  let url: URL;
  if (path.startsWith("/maps/api/geocode/json?")) {
    url = new URL(path, "https://maps.googleapis.com");
    url.searchParams.set("key", apiKey);
  } else if (
    path === "/v1/places:searchText" ||
    path === "/v1/places:searchNearby" ||
    /^\/v1\/places\/[^/?]+(?:\?languageCode=[A-Za-z-]+)?$/.test(path)
  ) {
    url = new URL(`https://places.googleapis.com${path}`);
    headers.set("X-Goog-Api-Key", apiKey);
    headers.set("Content-Type", "application/json");
    if (fieldMask) headers.set("X-Goog-FieldMask", fieldMask);
  } else {
    throw new Error("Unsupported Google Maps request");
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...request,
      headers,
      signal: request.signal ?? AbortSignal.timeout(15000),
    });
  } catch {
    // Geocoding URLs contain the server key; keep fetch errors out of user-visible output.
    throw new Error("Map search could not connect. Please try again.");
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const googleStatus = payload?.error?.status;
    const googleMessage = String(payload?.error?.message ?? "").slice(0, 180);
    console.error(
      `[Google Maps] HTTP ${response.status}; API status ${googleStatus ?? "unknown"}; ${googleMessage}`,
    );
    if (response.status === 403) {
      throw new Error(
        `Google denied the restaurant search${googleMessage ? `: ${googleMessage}` : ". Enable Places API (New), confirm billing is active, and allow Places API (New) on the server key."}`,
      );
    }
    if (response.status === 400) {
      throw new Error(
        `Google rejected the restaurant search request (${googleStatus ?? "INVALID_ARGUMENT"})${googleMessage ? `: ${googleMessage}` : "."}`,
      );
    }
    throw new Error(
      `Google restaurant search failed (${response.status}${googleStatus ? ` ${googleStatus}` : ""})${googleMessage ? `: ${googleMessage}` : "."}`,
    );
  }

  const result = await response.json();
  if (result.status && result.status !== "OK" && result.status !== "ZERO_RESULTS") {
    throw new Error(`Map search failed (${result.status})`);
  }
  return result;
}
