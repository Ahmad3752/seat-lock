import { useEffect, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { api } from "../lib/api";
import { Icon } from "../components/Icon";

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
  return <section className="management-page" aria-labelledby="admin-heading">
    <div className="management-header"><div><p className="eyebrow">PLATFORM WORKSPACE</p><h1 id="admin-heading">Platform administration</h1><p className="muted">A clear view of your community, events, and bookings.</p></div><span className="metric"><Icon name="shield" />Administrator access</span></div>
    {error && <p role="alert">{error}</p>}
    <div className="stats-grid" aria-label="Platform summary">
      {[["Users", data.summary.users], ["Organizers", data.summary.organizers], ["Events", data.summary.events], ["Bookings", data.summary.bookings]].map(([label, value]) => <article className="card stat-card" key={label}><span>{label}</span><strong>{Number(value).toLocaleString()}</strong></article>)}
    </div>
    <div className="workspace-banner"><div><h2>Simulated total: PKR {data.summary.simulatedTotal.toLocaleString()}</h2><p>Overview of SeatLock. Sales amounts are simulated, not real payments.</p></div><Icon name="ticket" /></div>
    <section className="card dashboard-card" aria-labelledby="users-heading"><div className="section-title"><h2 id="users-heading">Users and organizer access</h2><p className="muted">Manage who can create and publish events.</p></div>
      <div className="table-scroll" role="region" aria-label="Platform users" tabIndex={0}><table><thead><tr><th scope="col">User</th><th scope="col">Role</th><th scope="col">Access</th></tr></thead><tbody>{data.users.map((user) => <tr key={user._id}><td><strong>{user.name}</strong><span className="table-subline">{user.email}</span></td><td><span className="status">{user.role}</span></td><td>{user.role !== "admin" ? <button type="button" className={`text-button${user.role === "organizer" ? " danger-action" : ""}`} disabled={busy} onClick={() => { if (window.confirm(`Change organizer access for ${user.email}?`)) void change(`/admin/users/${user._id}/role`, "PATCH", { role: user.role === "organizer" ? "customer" : "organizer" }); }}>{user.role === "organizer" ? "Revoke organizer" : "Grant organizer"}</button> : <span className="table-subline">Administrator</span>}</td></tr>)}</tbody></table></div>
    </section>
    <section className="card dashboard-card" aria-labelledby="admin-events-heading"><h2 id="admin-events-heading">Events</h2>{data.events.length === 0 ? <p>No events.</p> : <div className="table-scroll" role="region" aria-label="Platform events" tabIndex={0}><table><thead><tr><th scope="col">Event</th><th scope="col">Organizer</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>{data.events.map((event) => <tr key={event._id}><td><strong>{event.title}</strong><span className="table-subline">{new Date(event.startsAt).toLocaleDateString()}</span></td><td>{data.users.find((user) => user._id === event.organizerId)?.name ?? "Unknown organizer"}</td><td><span className={`status ${event.status}`}>{event.status}</span></td><td><div className="table-actions"><button type="button" className="text-button" onClick={() => navigate(`/organizer/events/${event._id}/report`)}>View report</button><button type="button" className="text-button" onClick={() => navigate(`/organizer/events/${event._id}/edit`)}>Edit event</button>{event.status !== "cancelled" && <button type="button" className="text-button danger-action" disabled={busy} onClick={() => { if (window.confirm(`Cancel ${event.title}? Existing bookings remain and no refunds are issued.`)) void change(`/admin/events/${event._id}/cancel`, "POST"); }}>Cancel event</button>}</div></td></tr>)}</tbody></table></div>}</section>
    <section className="card dashboard-card" aria-labelledby="support-heading"><h2 id="support-heading">Bookings for support</h2>{data.bookings.length === 0 ? <p>No bookings.</p> : <div className="table-scroll" role="region" aria-label="Support bookings" tabIndex={0}><table><thead><tr><th scope="col">Reference / event</th><th scope="col">Customer</th><th scope="col">Seats</th><th scope="col">Total</th><th scope="col">Payment</th></tr></thead><tbody>{data.bookings.map((booking) => <tr key={booking._id}><td><strong>{booking.reference}</strong><span className="table-subline">{booking.eventTitle}</span></td><td>{data.users.find((user) => user._id === booking.customerId)?.name ?? "Unknown customer"}</td><td>{booking.seats.map((seat) => seat.label).join(", ")}</td><td>PKR {booking.total.toLocaleString()}</td><td><span className="status">{booking.paymentStatus}</span></td></tr>)}</tbody></table></div>}</section>
  </section>;
}
