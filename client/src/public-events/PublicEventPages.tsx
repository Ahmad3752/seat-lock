import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { AuthUser } from "../auth/auth-context";
import { useAuth } from "../auth/useAuth";
import { ApiError, api } from "../lib/api";
import { buildEventQuery, MAX_SEAT_SELECTION, toggleSeatSelection, type EventFilters, type PublicSeat } from "./publicEventUtils";
import { formatHoldCountdown, reconcileSelectedSeats, remainingHoldSeconds } from "./holdUtils";
import { io } from "socket.io-client";

type Navigate = (to: string) => void;
type PublicEventCard = { id: string; slug: string; title: string; category: string; posterUrl: string; startsAt: string; priceFrom: number; venue: { name: string; address: string } };
type PublicEventDetail = { id: string; slug: string; title: string; description: string; posterUrl: string; category: string; venue: { name: string; address: string }; startsAt: string; endsAt: string; timezone: string; currency: string; sale: { startsAt: string | null; endsAt: string | null; isOpen: boolean }; pricing: { from: number; to: number; sections: Array<{ section: string; amount: number }> } };
type SeatHold = { id: string; status: string; expiresAt: string; seats: Array<{ id: string; label: string; price: number }>; total: number; currency: string };

const emptyFilters: EventFilters = { q: "", category: "", city: "", from: "", to: "" };
const money = (amount: number) => new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR" }).format(amount);
const dateTime = (value: string) => new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const readableError = (caught: unknown, fallback: string) => caught instanceof ApiError ? caught.message : fallback;

function PublicLink({ to, navigate, children, className }: { to: string; navigate: Navigate; children: ReactNode; className?: string }) {
  return <a className={className} href={to} onClick={(event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(to);
  }}>{children}</a>;
}

function Poster({ src, title }: { src: string; title: string }) {
  const [isBroken, setIsBroken] = useState(!src);
  if (isBroken) return <div className="event-poster event-poster-fallback" aria-label={`No poster available for ${title}`}>SeatLock<br />Event</div>;
  return <img className="event-poster" src={src} alt={`${title} poster`} onError={() => setIsBroken(true)} />;
}

export function EventCataloguePage({ navigate }: { navigate: Navigate }) {
  const [filters, setFilters] = useState(emptyFilters);
  const [submittedFilters, setSubmittedFilters] = useState(emptyFilters);
  const [events, setEvents] = useState<PublicEventCard[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    void api<{ events: PublicEventCard[] }>(`/events${buildEventQuery(submittedFilters)}`)
      .then((data) => { if (active) setEvents(data.events); })
      .catch((caught) => { if (active) setError(readableError(caught, "Unable to load events.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [submittedFilters, reloadKey]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    setSubmittedFilters({ ...filters });
  }

  function clearFilters() {
    const cleared = { ...emptyFilters };
    setFilters(cleared);
    setError("");
    setLoading(true);
    setSubmittedFilters(cleared);
  }

  return <section className="public-events-page" aria-labelledby="events-heading">
    <div className="public-intro"><p className="eyebrow">DISCOVER EVENTS</p><h1 id="events-heading">Find your next seat.</h1><p className="muted">Browse upcoming events and choose your seats when you are ready.</p></div>
    <form className="event-filters card" onSubmit={submit} aria-label="Filter events">
      <label>Search events<input value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} placeholder="Artist, show, or event" /></label>
      <label>Category<input value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))} placeholder="Music" /></label>
      <label>City<input value={filters.city} onChange={(event) => setFilters((current) => ({ ...current, city: event.target.value }))} placeholder="Karachi" /></label>
      <label>From<input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} /></label>
      <label>To<input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} /></label>
      <div className="filter-actions"><button type="submit">Apply filters</button><button type="button" className="text-button" onClick={clearFilters}>Clear</button></div>
    </form>
    {loading && <p className="public-state muted" aria-live="polite">Loading upcoming events…</p>}
    {!loading && error && <section className="card public-state" role="alert"><h2>We could not load events</h2><p>{error}</p><button type="button" onClick={() => { setError(""); setLoading(true); setReloadKey((current) => current + 1); }}>Try again</button></section>}
    {!loading && !error && events.length === 0 && <section className="card public-state"><h2>No upcoming events found</h2><p>Try adjusting your search or filters.</p><button type="button" className="secondary" onClick={clearFilters}>Clear filters</button></section>}
    {!loading && !error && events.length > 0 && <div className="event-catalogue">{events.map((event) => <article className="event-card card" key={event.id}><Poster src={event.posterUrl} title={event.title} /><div className="event-card-body"><p className="eyebrow">{event.category}</p><h2><PublicLink to={`/events/${event.slug}`} navigate={navigate}>{event.title}</PublicLink></h2><p>{event.venue.name} · {event.venue.address}</p><p>{dateTime(event.startsAt)}</p><strong>From {money(event.priceFrom)}</strong></div></article>)}</div>}
  </section>;
}

function SeatMap({ seats, selectedSeatIds, onToggle, locked }: { seats: PublicSeat[]; selectedSeatIds: ReadonlySet<string>; onToggle: (seat: PublicSeat) => void; locked: boolean }) {
  const sections = useMemo(() => [...new Set(seats.map((seat) => seat.section))].map((section) => ({ section, seats: seats.filter((seat) => seat.section === section) })), [seats]);
  return <div className="seat-sections" aria-label="Seat map">{sections.map(({ section, seats: sectionSeats }) => {
    const columns = Math.max(...sectionSeats.map((seat) => seat.x));
    return <section className="seat-section" key={section} aria-labelledby={`section-${section}`}><h3 id={`section-${section}`}>Section {section}</h3><div className="seat-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(3.35rem, 1fr))` }}>{sectionSeats.map((seat) => {
      const selected = selectedSeatIds.has(seat.id);
      const selectable = !locked && seat.state === "available";
      const accessibility = seat.accessibility.isAccessible ? ", accessible" : "";
      return <button type="button" key={seat.id} className={`seat seat-${seat.state}${selected ? " seat-selected" : ""}`} style={{ gridColumn: seat.x, gridRow: seat.y }} disabled={!selectable} aria-pressed={selected} aria-label={`${seat.label}, ${seat.state}${accessibility}, ${money(seat.price)}`} onClick={() => onToggle(seat)}><span>{seat.label}</span><small>{seat.state}</small></button>;
    })}</div></section>;
  })}</div>;
}

function DemoCheckout({ hold, accessToken, onBooked }: { hold: SeatHold; accessToken: string; onBooked: (reference: string) => void }) {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true); setError("");
    try {
      const result = await api<{ booking: { reference: string } }>("/bookings/checkout", { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ holdId: hold.id, amount: Number(amount) }) });
      onBooked(result.booking.reference);
    } catch (caught) { setError(readableError(caught, "Unable to confirm this demo booking. Retry safely.")); }
    finally { setSubmitting(false); }
  }
  return <form className="card dashboard-card" onSubmit={(event) => void submit(event)}><h2>Demo checkout</h2><p>This is a simulation. No real payment is taken.</p><label>Enter the exact amount in rupees<input type="number" min="0" step="1" required value={amount} onChange={(event) => setAmount(event.target.value)} /></label>{error && <p className="form-error" role="alert">{error}</p>}<button type="submit" disabled={submitting}>{submitting ? "Confirming…" : "Confirm demo booking"}</button></form>;
}

export function PublicEventDetailPage({ slug, navigate, user }: { slug: string; navigate: Navigate; user: AuthUser | null }) {
  const { accessToken } = useAuth();
  const [event, setEvent] = useState<PublicEventDetail | null>(null);
  const [seats, setSeats] = useState<PublicSeat[]>([]);
  const [detailError, setDetailError] = useState("");
  const [seatError, setSeatError] = useState("");
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [hasLoadedSeats, setHasLoadedSeats] = useState(false);
  const [selectedSeatIds, setSelectedSeatIds] = useState<Set<string>>(() => new Set());
  const [hold, setHold] = useState<SeatHold | null>(null);
  const [holdError, setHoldError] = useState("");
  const [holdNotice, setHoldNotice] = useState("");
  const [bookingReference, setBookingReference] = useState("");
  const [pending, setPending] = useState(false);
  const [seatRefresh, setSeatRefresh] = useState(0);
  const [liveDisconnected, setLiveDisconnected] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const reservationKey = useRef<string | null>(null);
  const requestInFlight = useRef(false);

  useEffect(() => {
    let active = true;
    void api<{ event: PublicEventDetail }>(`/events/${encodeURIComponent(slug)}`)
      .then((data) => { if (active) setEvent(data.event); })
      .catch((caught) => { if (active) setDetailError(readableError(caught, "Unable to load this event.")); })
      .finally(() => { if (active) setLoadingDetail(false); });
    return () => { active = false; };
  }, [slug]);

  useEffect(() => {
    if (!event) return;
    let active = true;
    void api<{ seats: PublicSeat[] }>(`/events/${event.id}/seats`)
      .then((data) => { if (active) { setSeats(data.seats); setSeatError(""); setSelectedSeatIds((current) => reconcileSelectedSeats(current, data.seats)); } })
      .catch((caught) => { if (active) setSeatError(readableError(caught, "Unable to load the seat map.")); })
      .finally(() => { if (active) setHasLoadedSeats(true); });
    return () => { active = false; };
  }, [event, seatRefresh]);

  useEffect(() => {
    if (!event) return;
    const socket = io();
    socket.on("connect", () => {
      socket.emit("join-event", event.id, (joined: boolean) => {
        if (joined) { setLiveDisconnected(false); setSeatRefresh((value) => value + 1); }
        else setLiveDisconnected(true);
      });
    });
    socket.on("seats-changed", (message: { eventId?: string }) => {
      if (message?.eventId === event.id) setSeatRefresh((value) => value + 1);
    });
    socket.on("disconnect", () => setLiveDisconnected(true));
    socket.on("connect_error", () => setLiveDisconnected(true));
    return () => { socket.disconnect(); };
  }, [event]);

  useEffect(() => {
    if (!hold) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hold]);

  useEffect(() => {
    if (!hold || remainingHoldSeconds(hold.expiresAt, now) > 0) return;
    const timer = window.setTimeout(() => {
      setHold(null); setSelectedSeatIds(new Set()); reservationKey.current = null;
      setHoldNotice("Your hold expired. Please select seats again."); setSeatRefresh((value) => value + 1);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [hold, now]);

  function toggleSeat(seat: PublicSeat) {
    if (pending || hold) return;
    reservationKey.current = null;
    setHoldError(""); setHoldNotice("");
    setSelectedSeatIds((current) => toggleSeatSelection(current, seat));
  }

  async function reserveSeats() {
    if (!event || !accessToken || !user || (user.role !== "customer" && user.role !== "organizer") || !event.sale.isOpen || selectedSeatIds.size === 0 || requestInFlight.current) return;
    requestInFlight.current = true; setPending(true); setHoldError(""); setHoldNotice("");
    const key = reservationKey.current ?? crypto.randomUUID();
    reservationKey.current = key;
    try {
      const data = await api<{ hold: SeatHold }>(`/events/${event.id}/holds`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ seatIds: [...selectedSeatIds], idempotencyKey: key }) });
      if (data.hold.status !== "active" || remainingHoldSeconds(data.hold.expiresAt) === 0) {
        reservationKey.current = null; setSelectedSeatIds(new Set()); setSeatRefresh((value) => value + 1);
        setHoldNotice("That hold is no longer active. Please select seats again."); return;
      }
      setNow(Date.now()); setHold(data.hold); setSeatRefresh((value) => value + 1);
    } catch (caught) {
      if (caught instanceof ApiError && (caught.code === "SEAT_UNAVAILABLE" || caught.code === "IDEMPOTENCY_CONFLICT")) {
        reservationKey.current = null; setSelectedSeatIds(new Set()); setSeatRefresh((value) => value + 1);
        setHoldError("One or more seats are no longer available. Please choose again.");
      } else setHoldError(readableError(caught, "Could not reserve seats. You can retry safely."));
    } finally { requestInFlight.current = false; setPending(false); }
  }

  async function releaseHold() {
    if (!hold || !accessToken || requestInFlight.current) return;
    requestInFlight.current = true; setPending(true); setHoldError("");
    try {
      await api<void>(`/holds/${hold.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
      setHold(null); setSelectedSeatIds(new Set()); reservationKey.current = null; setSeatRefresh((value) => value + 1); setHoldNotice("Your hold was released.");
    } catch (caught) { setHoldError(readableError(caught, "Could not release your hold. Please try again.")); }
    finally { requestInFlight.current = false; setPending(false); }
  }

  const selectedSeats = seats.filter((seat) => selectedSeatIds.has(seat.id));
  const total = selectedSeats.reduce((sum, seat) => sum + seat.price, 0);
  const currentRoute = `/events/${encodeURIComponent(slug)}`;
  const loadingSeats = !hasLoadedSeats && !seatError;

  if (loadingDetail) return <section className="public-state"><p className="muted" aria-live="polite">Loading event details…</p></section>;
  if (detailError || !event) return <section className="card public-state" role="alert"><h1>Event unavailable</h1><p>{detailError || "This event is no longer available."}</p><button type="button" onClick={() => navigate("/events")}>Browse events</button></section>;

  return <section className="event-detail-page" aria-labelledby="event-title">
    <button type="button" className="text-button back-link" onClick={() => navigate("/events")}>← Back to events</button>
    <section className="event-hero card"><Poster src={event.posterUrl} title={event.title} /><div><p className="eyebrow">{event.category}</p><h1 id="event-title">{event.title}</h1><p className="muted">{event.description}</p><dl className="event-facts"><div><dt>When</dt><dd>{dateTime(event.startsAt)} – {dateTime(event.endsAt)}</dd></div><div><dt>Venue</dt><dd>{event.venue.name}, {event.venue.address}</dd></div><div><dt>Ticket sales</dt><dd>{event.sale.isOpen ? "Open now" : "Not currently open"}{event.sale.endsAt ? ` · ends ${dateTime(event.sale.endsAt)}` : ""}</dd></div><div><dt>Prices</dt><dd>{money(event.pricing.from)} – {money(event.pricing.to)}</dd></div></dl></div></section>
    <section className="seat-selection-layout"><div className="seat-map-card card"><div className="section-heading"><div><p className="eyebrow">CHOOSE SEATS</p><h2>Seat map</h2></div><p className="seat-count" aria-live="polite">{hold ? hold.seats.length : selectedSeatIds.size} of {MAX_SEAT_SELECTION} selected</p></div><p className="seat-legend" aria-label="Seat state legend"><span className="legend-item legend-available">Available</span><span className="legend-item legend-held">Held</span><span className="legend-item legend-booked">Booked</span><span className="legend-item legend-blocked">Blocked</span></p>{liveDisconnected && <p className="muted" role="status">Live updates disconnected. Reconnecting…</p>}{loadingSeats && <p className="muted" aria-live="polite">Loading current seat availability…</p>}{seatError && <p className="form-error" role="alert">{seatError}</p>}{!loadingSeats && !seatError && <SeatMap seats={seats} selectedSeatIds={selectedSeatIds} onToggle={toggleSeat} locked={pending || Boolean(hold)} />}</div>
      <aside className="selection-summary card" aria-labelledby="selection-heading"><p className="eyebrow">YOUR SELECTION</p><h2 id="selection-heading">{hold ? "Seats held" : `${selectedSeatIds.size} seat${selectedSeatIds.size === 1 ? "" : "s"} selected`}</h2>{hold ? <><p className="hold-countdown" role="status">Held for {formatHoldCountdown(remainingHoldSeconds(hold.expiresAt, now))}</p><ul>{hold.seats.map((seat) => <li key={seat.id}><span>{seat.label}</span><span>{money(seat.price)}</span></li>)}</ul></> : selectedSeats.length === 0 ? <p className="muted">Select an available seat to see your total.</p> : <ul>{selectedSeats.map((seat) => <li key={seat.id}><span>{seat.label}</span><span>{money(seat.price)}</span><button type="button" className="text-button" disabled={pending} onClick={() => toggleSeat(seat)}>Remove</button></li>)}</ul>}<div className="selection-total"><span>Total</span><strong>{money(hold?.total ?? total)}</strong></div>{hold ? <button type="button" className="secondary" disabled={pending} onClick={() => void releaseHold()}>{pending ? "Releasing…" : "Release hold"}</button> : !user ? <button type="button" onClick={() => navigate(`/login?returnTo=${encodeURIComponent(currentRoute)}`)}>Continue to sign in</button> : user.role !== "customer" && user.role !== "organizer" ? <p className="muted">Sign in as a customer or organizer to reserve seats.</p> : <button type="button" disabled={pending || selectedSeatIds.size === 0 || !event.sale.isOpen} onClick={() => void reserveSeats()}>{pending ? "Reserving…" : "Reserve seats"}</button>}{holdError && <p className="form-error" role="alert">{holdError}</p>}{holdNotice && <p role="status">{holdNotice}</p>}</aside>
      {hold && accessToken && <DemoCheckout hold={hold} accessToken={accessToken} onBooked={(reference) => { setHold(null); setSelectedSeatIds(new Set()); setSeatRefresh((value) => value + 1); setBookingReference(reference); }} />}
      {bookingReference && <section className="card dashboard-card" role="status"><h2>Demo booking confirmed</h2><p>No real payment was taken. Ticket reference: {bookingReference}</p><button type="button" onClick={() => navigate("/dashboard")}>View my bookings</button></section>}
    </section>
  </section>;
}
