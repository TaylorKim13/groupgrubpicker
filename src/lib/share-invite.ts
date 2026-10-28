export function roomInviteMessage(origin: string, code: string): string {
  const roomCode = code.trim().toUpperCase();
  const link = new URL(`/invite/${encodeURIComponent(roomCode)}`, origin).href;
  // A URL on its own lets messaging apps generate a rich preview.
  return link;
}

export function roomInviteSmsUrl(message: string, userAgent: string, platform: string, maxTouchPoints: number): string {
  const appleMobile = /iPhone|iPad|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
  return `sms:${appleMobile ? "&" : "?"}body=${encodeURIComponent(message)}`;
}
