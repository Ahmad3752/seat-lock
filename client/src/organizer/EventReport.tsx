import { useEffect, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { api } from "../lib/api";

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
  return <section className="management-page"><button type="button" className="text-button" onClick={() => navigate("/organizer/events")}>← Back to events</button><h1>{report.event.title}</h1><p>{report.event.status} · {report.event.venue?.name ?? "Venue unavailable"} · {new Date(report.event.startsAt).toLocaleString()}</p><div className="dashboard-grid"><article className="card dashboard-card"><h2>Seat inventory</h2><p>Total: {report.seats.total} · Available: {report.seats.available}</p><p>Held: {report.seats.held} · Booked: {report.seats.booked} · Blocked: {report.seats.blocked}</p></article><article className="card dashboard-card"><h2>Confirmed demo bookings</h2><p>Bookings: {report.bookingCount} · Tickets: {report.ticketCount}</p><p>Simulated total: PKR {report.simulatedTotal.toLocaleString()}</p><p>No real payments were collected.</p></article></div><section className="card dashboard-card"><h2>Confirmed attendees</h2>{report.bookings.length === 0 ? <p>No confirmed bookings yet.</p> : <div style={{ overflowX: "auto" }}><table><thead><tr><th>Customer</th><th>Reference</th><th>Seats</th><th>Status</th><th>Date</th></tr></thead><tbody>{report.bookings.map((booking) => <tr key={booking.reference}><td>{booking.customer.name}<br />{booking.customer.email}</td><td>{booking.reference}</td><td>{booking.seats.join(", ")}</td><td>{booking.status} (demo)</td><td>{new Date(booking.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>}</section></section>;
}
