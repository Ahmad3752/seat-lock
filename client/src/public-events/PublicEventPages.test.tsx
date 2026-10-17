import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../lib/api";
import { PublicEventDetailPage } from "./PublicEventPages";

vi.mock("../auth/useAuth", () => ({ useAuth: () => ({ accessToken: "token" }) }));
vi.mock("../lib/api", () => ({
  api: vi.fn(),
  ApiError: class ApiError extends Error {
    code: string;
    constructor(code: string, message: string) { super(message); this.code = code; }
  },
}));

const user = { id: "customer", name: "Ali", email: "ali@example.com", role: "customer" as const };
const event = { id: "event", slug: "concert", title: "Concert", description: "A concert", posterUrl: "", category: "Music", venue: { name: "Hall", address: "Karachi" }, startsAt: "2030-01-01T12:00:00Z", endsAt: "2030-01-01T14:00:00Z", timezone: "Asia/Karachi", currency: "PKR", sale: { startsAt: null, endsAt: null, isOpen: true }, pricing: { from: 2500, to: 2500, sections: [] } };
const seat = { id: "seat-1", label: "A-01", section: "A", row: "A", number: 1, x: 1, y: 1, type: "standard", accessibility: { isAccessible: false }, price: 2500, state: "available" };
const hold = { id: "hold-1", status: "active", expiresAt: new Date(Date.now() + 600_000).toISOString(), seats: [{ id: seat.id, label: seat.label, price: seat.price }], total: 2500, currency: "PKR" };
const mockedApi = vi.mocked(api);

beforeEach(() => {
  mockedApi.mockReset();
  mockedApi.mockImplementation(async (path) => {
    if (path.endsWith("/seats")) return { seats: [seat] };
    if (path === "/events/concert") return { event };
    throw new Error(`Unexpected request ${path}`);
  });
});

async function chooseSeat() {
  render(<PublicEventDetailPage slug="concert" navigate={vi.fn()} user={user} />);
  fireEvent.click(await screen.findByRole("button", { name: /A-01, available/ }));
}

describe("customer seat holds", () => {
  it("preserves the idempotency key after a network failure and allows release", async () => {
    let attempt = 0;
    const bodies: string[] = [];
    mockedApi.mockImplementation(async (path, options) => {
      if (path === "/events/concert") return { event };
      if (path.endsWith("/seats")) return { seats: [seat] };
      if (path === "/events/event/holds") {
        bodies.push(String(options?.body));
        if (attempt++ === 0) throw new Error("offline");
        return { hold };
      }
      if (path === "/holds/hold-1") return undefined;
      throw new Error(`Unexpected request ${path}`);
    });
    await chooseSeat();
    fireEvent.click(screen.getByRole("button", { name: "Reserve seats" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reserve seats" }));
    expect(await screen.findByText("Seats held")).toBeTruthy();
    expect(JSON.parse(bodies[0]!).idempotencyKey).toBe(JSON.parse(bodies[1]!).idempotencyKey);
    fireEvent.click(screen.getByRole("button", { name: "Release hold" }));
    expect(await screen.findByText("Your hold was released.")).toBeTruthy();
  });

  it("clears selection and refreshes when a seat becomes unavailable", async () => {
    mockedApi.mockImplementation(async (path) => {
      if (path === "/events/concert") return { event };
      if (path.endsWith("/seats")) return { seats: [seat] };
      if (path === "/events/event/holds") throw new ApiError("SEAT_UNAVAILABLE", "Seat unavailable");
      throw new Error(`Unexpected request ${path}`);
    });
    await chooseSeat();
    fireEvent.click(screen.getByRole("button", { name: "Reserve seats" }));
    expect(await screen.findByText(/no longer available/)).toBeTruthy();
    await waitFor(() => expect((screen.getByRole("button", { name: "Reserve seats" }) as HTMLButtonElement).disabled).toBe(true));
    expect(mockedApi.mock.calls.filter(([path]) => path.endsWith("/seats")).length).toBeGreaterThan(1);
  });
});
