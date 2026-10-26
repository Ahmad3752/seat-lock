import { useEffect, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { api } from "../lib/api";
import { Icon } from "../components/Icon";

type Booking = { _id: string; reference: string; eventTitle: string; startsAt: string; seats: Array<{ label: string; price: number }>; total: number; currency: "PKR"; paymentStatus: "simulated" };

export function BookingHistory({ navigate }: { navigate: (to: string) => void }) {
  const { accessToken } = useAuth();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    void api<{ bookings: Booking[] }>("/bookings", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((result) => { if (active) setBookings(result.bookings); })
      .catch(() => { if (active) setError("Could not load your bookings. Refresh the page to retry."); });
    return () => { active = false; };
  }, [accessToken]);
  return <section className="dashboard" aria-labelledby="bookings-heading">
    <div className="management-header"><div><p className="eyebrow">YOUR EXPERIENCES</p><h1 id="bookings-heading">Your demo tickets</h1><p className="muted">All your upcoming moments, in one place. These are demo bookings; no real payment was taken.</p></div><button type="button" onClick={() => navigate("/events")}>Browse events<Icon name="arrow" /></button></div>
    {error && <p role="alert">{error}</p>}
    {!bookings && !error && <p className="muted" role="status">Loading bookings…</p>}
    {bookings?.length === 0 && <div className="card empty-state"><div className="state-icon"><Icon name="ticket" /></div><h2>Your next memory is waiting.</h2><p>You have no bookings yet. Explore upcoming events and find something you love.</p><button type="button" className="secondary" onClick={() => navigate("/events")}>Explore events<Icon name="arrow" /></button></div>}
    <div className="dashboard-grid">{bookings?.map((booking) => <article className="card dashboard-card" key={booking._id}>
      <div className="booking-topline"><Icon name="ticket" /><span className="status confirmed">Confirmed · demo</span></div>
      <h2>{booking.eventTitle}</h2>
      <p className="event-meta"><Icon name="calendar" /><span>{new Date(booking.startsAt).toLocaleString()}</span></p>
      <p>Seats: {booking.seats.map((seat) => seat.label).join(", ")}</p>
      <div className="booking-total"><span className="table-subline">Total</span><strong>{new Intl.NumberFormat("en-PK", { style: "currency", currency: booking.currency }).format(booking.total)}</strong></div>
      <p className="booking-disclaimer">Demo ticket reference</p><span className="ticket-reference">{booking.reference}</span>
      <p className="booking-disclaimer">No real payment was taken.</p>
    </article>)}</div>
  </section>;
}
