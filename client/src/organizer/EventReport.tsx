import { useEffect, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { api } from "../lib/api";
import { Icon } from "../components/Icon";

type Report = { event: { title: string; status: string; startsAt: string; venue: { name: string; address: string } | null }; seats: { total: number; available: number; held: number; booked: number; blocked: number }; bookingCount: number; ticketCount: number; simulatedTotal: number; bookings: Array<{ reference: string; customer: { name: string; email: string }; seats: string[]; status: string; createdAt: string }> };
export function EventReport({ eventId, navigate }: { eventId: string; navigate: (to: string) => void }) {
  const { accessToken } = useAuth();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void api<{ report: Report }>(`/organizer/events/${eventId}/report`, { headers: { Authorization: `Bearer ${accessToken}` } }).then((data) => { if (active) setReport(data.report); }).catch(() => { if (active) setError("Unable to load this event report."); });
    return () => { active = false; };
  }, [eventId, accessToken]);
  if (error) return <p role="alert">{error}</p>;
  if (!report) return <p>Loading event report…</p>;
  return <section className="management-page">
    <button type="button" className="text-button back-link" onClick={() => navigate("/organizer/events")}>← Back to events</button>
    <div className="management-header"><div><p className="eyebrow">EVENT REPORT</p><h1>{report.event.title}</h1><p className="muted">{report.event.venue?.name ?? "Venue unavailable"} · {new Date(report.event.startsAt).toLocaleString()}</p></div><span className={`status ${report.event.status}`}>{report.event.status}</span></div>
    <div className="stats-grid" aria-label="Seat inventory">
      {[["Total seats", report.seats.total], ["Available", report.seats.available], ["Held", report.seats.held], ["Booked", report.seats.booked]].map(([label, value]) => <article className="card stat-card" key={label}><span>{label}</span><strong>{Number(value).toLocaleString()}</strong></article>)}
    </div>
    <div className="dashboard-grid"><article className="card dashboard-card"><div className="dashboard-card-icon"><Icon name="venue" /></div><h2>Seat inventory</h2><p>Total: {report.seats.total} · Available: {report.seats.available}</p><p>Held: {report.seats.held} · Booked: {report.seats.booked} · Blocked: {report.seats.blocked}</p></article><article className="card dashboard-card"><div className="dashboard-card-icon"><Icon name="ticket" /></div><h2>Confirmed demo bookings</h2><p>Bookings: {report.bookingCount} · Tickets: {report.ticketCount}</p><div className="booking-total"><span className="table-subline">Simulated total</span><strong>PKR {report.simulatedTotal.toLocaleString()}</strong></div><p className="booking-disclaimer">No real payments were collected.</p></article></div>
    <section className="card dashboard-card"><h2>Confirmed attendees</h2>{report.bookings.length === 0 ? <p>No confirmed bookings yet.</p> : <div className="table-scroll" role="region" aria-label="Confirmed attendees" tabIndex={0}><table><thead><tr><th scope="col">Customer</th><th scope="col">Reference</th><th scope="col">Seats</th><th scope="col">Status</th><th scope="col">Date</th></tr></thead><tbody>{report.bookings.map((booking) => <tr key={booking.reference}><td><strong>{booking.customer.name}</strong><span className="table-subline">{booking.customer.email}</span></td><td>{booking.reference}</td><td>{booking.seats.join(", ")}</td><td><span className={`status ${booking.status}`}>{booking.status} (demo)</span></td><td>{new Date(booking.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>}</section>
  </section>;
}
