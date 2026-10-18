import { useEffect, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { api } from "../lib/api";

type Overview = { users: Array<{ _id: string; name: string; email: string; role: "customer" | "organizer" | "admin" }>; events: Array<{ _id: string; title: string; status: string; organizerId: string; startsAt: string }>; bookings: Array<{ _id: string; customerId: string; eventTitle: string; reference: string; seats: Array<{ label: string }>; total: number; paymentStatus: string }>; summary: { users: number; organizers: number; events: number; bookings: number; simulatedTotal: number } };
export function AdminPage({ navigate }: { navigate: (to: string) => void }) {
  const { accessToken } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void api<Overview>("/admin/overview", { headers: { Authorization: `Bearer ${accessToken}` } }).then((value) => { if (active) setData(value); }).catch(() => { if (active) setError("Unable to load platform information."); });
    return () => { active = false; };
  }, [accessToken, revision]);
  async function change(path: string, method: string, body?: object) {
    setBusy(true); setError("");
    try { await api(path, { method, headers: { Authorization: `Bearer ${accessToken}` }, ...(body ? { body: JSON.stringify(body) } : {}) }); setRevision((value) => value + 1); }
    catch { setError("The action could not be completed. Please try again."); }
    finally { setBusy(false); }
  }
  if (!data) return <p role={error ? "alert" : undefined}>{error || "Loading platform dashboard…"}</p>;
  return <section className="management-page"><h1>Platform administration</h1><p>Overview of SeatLock. Sales amounts below are simulated, not real payments.</p>{error && <p role="alert">{error}</p>}<div className="card dashboard-card"><h2>Platform summary</h2><p>Users: {data.summary.users} · Organizers: {data.summary.organizers} · Events: {data.summary.events} · Bookings: {data.summary.bookings}</p><p>Simulated total: PKR {data.summary.simulatedTotal.toLocaleString()}</p></div><section className="card dashboard-card"><h2>Users and organizer access</h2>{data.users.map((user) => <div key={user._id}><strong>{user.name}</strong> · <span>{user.email}</span> · {user.role} {user.role !== "admin" && <button type="button" className="text-button" disabled={busy} onClick={() => { if (window.confirm(`Change organizer access for ${user.email}?`)) void change(`/admin/users/${user._id}/role`, "PATCH", { role: user.role === "organizer" ? "customer" : "organizer" }); }}>{user.role === "organizer" ? "Revoke organizer" : "Grant organizer"}</button>}</div>)}</section><section className="card dashboard-card"><h2>Events</h2>{data.events.length === 0 ? <p>No events.</p> : data.events.map((event) => <p key={event._id}>{event.title} · {event.status} · {data.users.find((user) => user._id === event.organizerId)?.name ?? "Unknown organizer"} <button type="button" className="text-button" onClick={() => navigate(`/organizer/events/${event._id}/report`)}>View report</button> <button type="button" className="text-button" onClick={() => navigate(`/organizer/events/${event._id}/edit`)}>Edit event</button>{event.status !== "cancelled" && <button type="button" className="text-button" disabled={busy} onClick={() => { if (window.confirm(`Cancel ${event.title}? Existing bookings remain and no refunds are issued.`)) void change(`/admin/events/${event._id}/cancel`, "POST"); }}>Cancel event</button>}</p>)}</section><section className="card dashboard-card"><h2>Bookings for support</h2>{data.bookings.length === 0 ? <p>No bookings.</p> : data.bookings.map((booking) => <p key={booking._id}>{booking.reference} · {booking.eventTitle} · {data.users.find((user) => user._id === booking.customerId)?.name ?? "Unknown customer"} · {booking.seats.map((seat) => seat.label).join(", ")} · PKR {booking.total} · {booking.paymentStatus}</p>)}</section></section>;
}
