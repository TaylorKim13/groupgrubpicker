import { createFileRoute } from "@tanstack/react-router";
import { waitCardInput } from "@/lib/wait-card.server";

export const Route = createFileRoute("/wait")({
  server: { handlers: {
    GET: ({ request }) => {
      const url = new URL(request.url);
      const input = waitCardInput(url);
      if (!input) return new Response("Invalid wait-time card", { status: 400 });
      const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
      const imageUrl = new URL("/wait-card.png", url.origin);
      imageUrl.searchParams.set("name", input.name);
      imageUrl.searchParams.set("minutes", String(input.minutes));
      const image = escape(imageUrl.href);
      const title = escape(`${input.name} · ${input.minutes} min wait`);
      return new Response(`<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Group Grub</title>
<meta name="description" content="A shared restaurant wait-time estimate. Times may change.">
<meta property="og:type" content="website"><meta property="og:site_name" content="Group Grub">
<meta property="og:title" content="${title}"><meta property="og:description" content="Estimated wait time. Shared snapshot, not live data.">
<meta property="og:url" content="${escape(url.href)}"><meta property="og:image" content="${image}">
<meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${title}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${image}">
<style>*{box-sizing:border-box}body{margin:0;padding:24px;min-height:100dvh;display:grid;place-items:center;background:#fff7df;font-family:system-ui,sans-serif;color:#241a14}main{max-width:900px;width:100%;border:3px solid #241a14;border-radius:22px;overflow:hidden;background:#fffdf5;box-shadow:8px 9px 0 #241a14}img{display:block;width:100%;height:auto}footer{padding:20px 28px;border-top:2px solid #241a14;color:#68584c;font-size:14px}a{color:#db3329;font-weight:700}</style>
</head><body><main><img src="${image}" alt="${title}" width="1200" height="630"><footer>This is a shared estimate, not a live wait-time update. Local demo restaurant times are sample data. <a href="/">Open Group Grub →</a></footer></main></body></html>`, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" },
      });
    },
  } },
});
