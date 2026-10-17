export function remainingHoldSeconds(expiresAt: string, now = Date.now()): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
}

export function formatHoldCountdown(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function reconcileSelectedSeats(selected: ReadonlySet<string>, seats: Array<{ id: string; state: string }>): Set<string> {
  const available = new Set(seats.filter((seat) => seat.state === "available").map((seat) => seat.id));
  return new Set([...selected].filter((id) => available.has(id)));
}
