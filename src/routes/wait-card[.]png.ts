import { createFileRoute } from "@tanstack/react-router";
import { renderWaitCard, waitCardInput } from "@/lib/wait-card.server";

export const Route = createFileRoute("/wait-card.png")({
  server: { handlers: {
    GET: async ({ request }) => {
      const input = waitCardInput(new URL(request.url));
      if (!input) return new Response("Invalid wait-time card", { status: 400 });
      const png = await renderWaitCard(input.name, input.minutes);
      return new Response(new Uint8Array(png), { headers: {
        "Content-Type": "image/png", "Cache-Control": "public, max-age=86400",
      } });
    },
  } },
});
