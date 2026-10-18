import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { BookingHistory } from "./BookingHistory";

vi.mock("../auth/useAuth", () => ({ useAuth: () => ({ accessToken: "token" }) }));
vi.mock("../lib/api", () => ({ api: async () => ({ bookings: [{ _id: "1", reference: "SL-123", eventTitle: "Concert", startsAt: "2030-01-01T12:00:00Z", seats: [{ label: "A-01", price: 1000 }], total: 1000, currency: "PKR", paymentStatus: "simulated" }] }) }));

it("shows the customer's saved demo booking and ticket reference", async () => {
  render(<BookingHistory navigate={vi.fn()} />);
  expect(await screen.findByText("Concert")).toBeTruthy();
  expect(screen.getByText(/SL-123/)).toBeTruthy();
  expect(screen.getByText(/A-01/)).toBeTruthy();
});
