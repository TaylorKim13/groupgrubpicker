import { createFileRoute } from "@tanstack/react-router";
import { publicOrigin } from "@/lib/public-origin.server";

// Serve complete metadata in the first HTML response. Link preview fetchers
// do not need JavaScript, a room session, or database access.
export const Route = createFileRoute("/invite/$code")({
  server: {
    handlers: {
      GET: ({ request, params }) => {
        const code = params.code.toUpperCase();
        if (!/^[A-Z0-9]{6}$/.test(code)) return new Response("Invalid invitation", { status: 400 });
        const origin = publicOrigin(request);
        const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
        const image = escape(new URL("/invite-card.png", origin).href);
        const url = escape(new URL(`/invite/${code}`, origin).href);
        const join = `/room/${code}`;
        const title = `Join my table ${code} · Group Grub`;
        return new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="Pick your favorite restaurants and vote on where the group eats. Tap to join the table.">
<meta property="og:site_name" content="Group Grub"><meta property="og:type" content="website">
<meta property="og:title" content="${title}"><meta property="og:description" content="You're invited! Pick your favorites and let the group decide.">
<meta property="og:url" content="${url}"><meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:type" content="image/png"><meta property="og:image:alt" content="Group Grub. Where are we eating? Join the table.">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${image}">
<link rel="canonical" href="${url}"><link rel="icon" href="/favicon.ico">
<style>*{box-sizing:border-box}body{margin:0;background:#fff7df;color:#241a14;font-family:system-ui,sans-serif;min-height:100dvh;display:grid;place-items:center;padding:24px}.card{max-width:620px;width:100%;border:3px solid #241a14;border-radius:24px;background:#fffdf5;overflow:hidden;box-shadow:8px 9px 0 #241a14}img{display:block;width:100%;height:auto;border-bottom:3px solid #241a14}.content{padding:28px}.eyebrow{font-size:13px;letter-spacing:.14em;font-weight:800;color:#db3329}h1{font-size:32px;margin:12px 0}p{color:#68584c;line-height:1.6}a{display:block;text-align:center;padding:17px;background:#db3329;color:white;border:2px solid #241a14;border-radius:14px;font-size:19px;font-weight:800;text-decoration:none;box-shadow:4px 5px 0 #241a14}a:focus-visible{outline:4px solid #ffcc38;outline-offset:4px}.code{letter-spacing:.16em;font-weight:800}</style>
</head><body><main class="card"><img src="/invite-card.png" width="1200" height="630" alt="Group Grub — Where are we eating? Join the table."><div class="content"><span class="eyebrow">YOU'RE INVITED</span><h1>Let's pick a place to eat.</h1><p>Join table <span class="code">${code}</span> to vote with your friends. No account needed.</p><a href="${join}">Join the table →</a></div></main></body></html>`, {
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" },
        });
      },
    },
  },
});
