export type EventFilters = { q: string; category: string; city: string; from: string; to: string };
export type SeatState = "available" | "held" | "booked" | "blocked";
export type PublicSeat = { id: string; label: string; section: string; row: string; number: number; x: number; y: number; type: string; accessibility: { isAccessible: boolean }; price: number; state: SeatState };

export const MAX_SEAT_SELECTION = 8;

export function buildEventQuery(filters: EventFilters) {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value.trim()) parameters.set(key, value.trim());
  }
  const query = parameters.toString();
  return query ? `?${query}` : "";
}

export function toggleSeatSelection(selectedSeatIds: ReadonlySet<string>, seat: PublicSeat, maximum = MAX_SEAT_SELECTION) {
  const next = new Set(selectedSeatIds);
  if (next.has(seat.id)) {
    next.delete(seat.id);
    return next;
  }
  if (seat.state !== "available" || next.size >= maximum) return next;
  next.add(seat.id);
  return next;
}
