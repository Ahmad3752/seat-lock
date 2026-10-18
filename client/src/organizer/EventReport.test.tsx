import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { EventReport } from "./EventReport";

vi.mock("../auth/useAuth", () => ({ useAuth: () => ({ accessToken: "token" }) }));
vi.mock("../lib/api", () => ({ api: async () => ({ report: { event: { title: "Concert", status: "published", startsAt: "2030-01-01", venue: { name: "Hall", address: "Karachi" } }, seats: { total: 3, available: 1, held: 1, booked: 1, blocked: 0 }, bookingCount: 1, ticketCount: 1, simulatedTotal: 1000, bookings: [{ customer: { name: "Ali", email: "ali@example.com" }, reference: "SL-123", seats: ["A-01"], status: "confirmed", createdAt: "2030-01-01" }] } }) }));
it("shows event counts and confirmed attendee details", async () => {
  render(<EventReport eventId="event" navigate={vi.fn()} />);
  expect(await screen.findByText("Concert")).toBeTruthy();
  expect(screen.getByText("SL-123")).toBeTruthy();
  expect(screen.getByText(/ali@example.com/)).toBeTruthy();
});
