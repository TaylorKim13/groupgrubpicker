# Google Maps setup

Maps, address lookup, and restaurant search connect directly to Google. No Lovable
account, gateway, tracking ID, or API key is used for these features.

Create two API keys in your Google Cloud project and enable billing and these APIs:

- **Maps JavaScript API** for displaying the map.
- **Geocoding API** for address lookup.
- **Places API (New)** for restaurant text search.

Add these values to your local `.env` and your hosting environment:

```dotenv
GOOGLE_MAPS_API_KEY=your_server_key
VITE_GOOGLE_MAPS_BROWSER_KEY=your_browser_key
```

Keep `GOOGLE_MAPS_API_KEY` server-only. Restrict it to Geocoding API and Places API
(New), and to your server's outbound IP addresses when your host provides stable
addresses. Do not apply website referrer restrictions to this server key.

The browser key is public by design. Restrict it to Maps JavaScript API and your
website origins, including your local development origin when testing.

Restart the development server after changing `.env`. Set the browser variable
before building for production because Vite embeds it at build time. Deploy the
server key as a runtime secret on a host that runs the application's server code.

Without the browser key, the map displays a configuration message. Without the
server key, address and restaurant searches report that search is not configured.
The curated restaurant pool and voting continue to work independently.

After configuring the keys, verify an address in the host controls, search for a
restaurant by name, nominate it, and check its marker on the map.

With the server key configured, the room pool automatically discovers real Google
restaurants around the saved group center. Discovery retrieves up to three pages
(60 candidates), excludes closed businesses, and applies circular distance and
known price limits. This is a candidate list, not an exhaustive directory. Unknown
prices stay visible and are labeled. Dietary terms influence the search, but dietary
and allergy suitability and live wait times are not verified; the UI states this.
Wait-time filtering applies only to the curated fallback, not unknown Google waits.

Discovery is shared across participants and cached for five minutes per location,
radius, price range, and dietary query. Failed searches are retried rather than
cached. When voting starts, the existing private `room_restaurants` table stores the
pool; subsequent votes and results use that snapshot so Google changes cannot alter
the ballot. No new migration is required. Without a server key the curated mock
pool remains available. Already-started voting sessions keep their original pool;
test discovery in a lobby or a new table.

References: [Geocoding](https://developers.google.com/maps/documentation/geocoding/guides-v3/requests-geocoding),
[Places text search](https://developers.google.com/maps/documentation/places/web-service/text-search),
and [API security](https://developers.google.com/maps/api-security-best-practices).
