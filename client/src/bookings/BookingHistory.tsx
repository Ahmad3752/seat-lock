import { useEffect, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { api } from "../lib/api";

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
  return <section className="dashboard"><div className="dashboard-intro"><p className="eyebrow">MY BOOKINGS</p><h1>Your demo tickets</h1><p className="muted">Demo bookings only. No real payment was taken.</p><button type="button" onClick={() => navigate("/events")}>Browse events</button></div>{error && <p role="alert">{error}</p>}{!bookings && !error && <p>Loading bookings…</p>}{bookings?.length === 0 && <p>You have no bookings yet.</p>}<div className="dashboard-grid">{bookings?.map((booking) => <article className="card dashboard-card" key={booking._id}><h2>{booking.eventTitle}</h2><p>{new Date(booking.startsAt).toLocaleString()}</p><p>Seats: {booking.seats.map((seat) => seat.label).join(", ")}</p><p>Total: {new Intl.NumberFormat("en-PK", { style: "currency", currency: booking.currency }).format(booking.total)}</p><p>Demo ticket reference: {booking.reference}</p><p>No real payment was taken.</p></article>)}</div></section>;
}
