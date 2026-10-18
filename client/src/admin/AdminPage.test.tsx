import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AdminPage } from "./AdminPage";

vi.mock("../auth/useAuth", () => ({ useAuth: () => ({ accessToken: "token" }) }));
vi.mock("../lib/api", () => ({ api: async () => ({ users: [{ _id: "user", name: "Ali", email: "ali@example.com", role: "customer" }], events: [], bookings: [], summary: { users: 1, organizers: 0, events: 0, bookings: 0, simulatedTotal: 0 } }) }));
it("shows platform users and organizer-access controls", async () => {
  render(<AdminPage navigate={vi.fn()} />);
  expect(await screen.findByText("ali@example.com")).toBeTruthy();
  expect(screen.getByRole("button", { name: /grant organizer/i })).toBeTruthy();
});
