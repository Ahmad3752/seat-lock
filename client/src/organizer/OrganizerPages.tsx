import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth/useAuth";
import { ApiError, api } from "../lib/api";

type Navigate = (to: string) => void;
type VenueSeat = { section: string; row: string; number: number; label: string; gridRow: number; gridColumn: number };
type Venue = { id: string; name: string; address: string; seats: VenueSeat[]; seatCount: number };
type Price = { section: string; amount: number };
type OrganizerEvent = { id: string; venueId: string; title: string; slug: string; description: string; category: string; imageUrl: string; startsAt: string; endsAt: string; saleStartsAt?: string; saleEndsAt?: string; timezone: string; status: "draft" | "published" | "cancelled"; currency: string; sectionPrices: Price[] };

const auth = (accessToken: string | null) => ({ headers: { Authorization: `Bearer ${accessToken ?? ""}` } });
const localDateTime = (value: string) => new Date(value).toISOString().slice(0, 16);

function readableError(caught: unknown, fallback: string) {
  if (!(caught instanceof ApiError)) return fallback;
  const details = Array.isArray(caught.details) ? caught.details.filter((detail): detail is string => typeof detail === "string") : [];
  return details.length ? `${caught.message} ${details.join(" ")}` : caught.message;
}
function ErrorMessage({ error }: { error: string }) { return error ? <p className="form-error" role="alert">{error}</p> : null; }

export function VenueListPage({ navigate }: { navigate: Navigate }) {
  const { accessToken } = useAuth();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { void api<{ venues: Venue[] }>("/organizer/venues", auth(accessToken)).then((data) => setVenues(data.venues)).catch((caught) => setError(caught instanceof ApiError ? caught.message : "Unable to load venues.")); }, [accessToken]);
  return <section className="management-page"><PageHeader eyebrow="ORGANIZER / VENUES" title="Your venues" description="Each venue keeps one reusable seat layout." action="Create venue" onAction={() => navigate("/organizer/venues/new")} />
    <ErrorMessage error={error} />
    {venues.length === 0 && !error ? <EmptyState title="No venues yet" text="Create a venue and generate its first seat grid." action="Create venue" onAction={() => navigate("/organizer/venues/new")} /> : <div className="management-grid">{venues.map((venue) => <article className="card management-card" key={venue.id}><h2>{venue.name}</h2><p>{venue.address}</p><span className="metric">{venue.seatCount} seats</span><div className="seat-preview" aria-label={`${venue.name} seat preview`}>{venue.seats.slice(0, 12).map((seat) => <span key={`${seat.section}-${seat.row}-${seat.number}`}>{seat.section}-{seat.label}</span>)}</div><button type="button" className="secondary" onClick={() => navigate(`/organizer/venues/${venue.id}/edit`)}>Edit layout</button></article>)}</div>}
  </section>;
}

export function VenueFormPage({ navigate, venueId }: { navigate: Navigate; venueId?: string }) {
  const { accessToken } = useAuth();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [sections, setSections] = useState("A, B, C, D");
  const [rows, setRows] = useState("A, B, C");
  const [seatsPerRow, setSeatsPerRow] = useState("10");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(Boolean(venueId));
  useEffect(() => {
    if (!venueId) return;
    let active = true;
    void api<{ venue: Venue }>(`/organizer/venues/${venueId}`, auth(accessToken)).then(({ venue }) => {
      if (!active) return;
      setName(venue.name); setAddress(venue.address);
      setSections([...new Set(venue.seats.map((seat) => seat.section))].join(", "));
      setRows([...new Set(venue.seats.map((seat) => seat.row))].join(", "));
      setSeatsPerRow(String(Math.max(...venue.seats.map((seat) => seat.number))));
    }).catch((caught) => { if (active) setError(readableError(caught, "Unable to load the venue.")); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accessToken, venueId]);
  const previewRows = rows.split(",").map((row) => row.trim().toUpperCase()).filter(Boolean);
  const previewSections = sections.split(",").map((section) => section.trim().toUpperCase()).filter(Boolean);
  const count = previewSections.length * previewRows.length * Number(seatsPerRow || 0);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSaving(true);
    try {
      await api(venueId ? `/organizer/venues/${venueId}` : "/organizer/venues", { method: venueId ? "PATCH" : "POST", ...auth(accessToken), body: JSON.stringify({ name, address, sections: previewSections, rows: previewRows, seatsPerRow: Number(seatsPerRow) }) });
      navigate("/organizer/venues");
    } catch (caught) { setError(readableError(caught, "Unable to create the venue.")); } finally { setSaving(false); }
  }
  if (loading) return <section className="form-page"><p className="muted">Loading venue layout…</p></section>;
  return <section className="form-page"><PageHeader eyebrow="ORGANIZER / VENUES" title={venueId ? "Edit venue layout" : "Create a venue"} description={venueId ? "Update the blocks, rows, and seats before this venue is used by an event." : "Enter a simple grid and SeatLock will generate every seat label."} />
    <form className="card management-form" onSubmit={(event) => void submit(event)}><label>Venue name<input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={120} placeholder="Karachi Arts Hall" /></label><label>Address<input value={address} onChange={(event) => setAddress(event.target.value)} required minLength={2} maxLength={250} placeholder="Main Street, Karachi" /></label><div className="form-columns"><label>Blocks / sections, separated by commas<input value={sections} onChange={(event) => setSections(event.target.value.toUpperCase())} required maxLength={200} placeholder="A, B, C, D" /></label><label>Seats per row<input type="number" value={seatsPerRow} onChange={(event) => setSeatsPerRow(event.target.value)} required min={1} max={200} /></label></div><label>Rows, separated by commas<input value={rows} onChange={(event) => setRows(event.target.value)} required placeholder="A, B, C" /><small>Each block receives these rows. For example, block A / row A produces seat A-01.</small></label><div className="layout-summary"><strong>{Number.isFinite(count) ? count : 0} seats will be created</strong><span>{previewSections.length || 0} blocks × {previewRows.length || 0} rows × {Number(seatsPerRow) || 0} seats</span></div><ErrorMessage error={error} /><div className="form-actions"><button type="submit" disabled={saving}>{saving ? "Saving…" : venueId ? "Save layout" : "Create venue"}</button><button type="button" className="secondary" onClick={() => navigate("/organizer/venues")}>Cancel</button></div></form>
  </section>;
}

export function EventListPage({ navigate }: { navigate: Navigate }) {
  const { accessToken } = useAuth();
  const [events, setEvents] = useState<OrganizerEvent[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { void api<{ events: OrganizerEvent[] }>("/organizer/events", auth(accessToken)).then((data) => setEvents(data.events)).catch((caught) => setError(caught instanceof ApiError ? caught.message : "Unable to load events.")); }, [accessToken]);
  return <section className="management-page"><PageHeader eyebrow="ORGANIZER / EVENTS" title="Your events" description="Draft an event, check its inventory, then publish when it is ready." action="Create event" onAction={() => navigate("/organizer/events/new")} />
    <ErrorMessage error={error} />
    {events.length === 0 && !error ? <EmptyState title="No events yet" text="Create a draft event from one of your venues." action="Create event" onAction={() => navigate("/organizer/events/new")} /> : <div className="management-grid">{events.map((item) => <article className="card management-card" key={item.id}><div className="card-heading"><h2>{item.title}</h2><span className={`status ${item.status}`}>{item.status}</span></div><p>{item.category} · {new Date(item.startsAt).toLocaleString()}</p><p>{item.sectionPrices.map((price) => `${price.section}: ${item.currency} ${price.amount}`).join(" · ")}</p><button type="button" onClick={() => navigate(`/organizer/events/${item.id}/edit`)}>{item.status === "draft" ? "Edit draft" : "View event"}</button></article>)}</div>}
  </section>;
}

export function EventFormPage({ navigate, eventId }: { navigate: Navigate; eventId?: string }) {
  const { accessToken } = useAuth();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueId, setVenueId] = useState("");
  const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); const [category, setCategory] = useState(""); const [imageUrl, setImageUrl] = useState("");
  const [startsAt, setStartsAt] = useState(""); const [endsAt, setEndsAt] = useState(""); const [timezone, setTimezone] = useState("Asia/Karachi"); const [currency, setCurrency] = useState("PKR");
  const [saleStartsAt, setSaleStartsAt] = useState(""); const [saleEndsAt, setSaleEndsAt] = useState("");
  const [prices, setPrices] = useState<Price[]>([]); const [status, setStatus] = useState<"draft" | "published" | "cancelled">("draft");
  const [error, setError] = useState(""); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([api<{ venues: Venue[] }>("/organizer/venues", auth(accessToken)), eventId ? api<{ event: OrganizerEvent }>(`/organizer/events/${eventId}`, auth(accessToken)) : Promise.resolve(null)])
      .then(([venueData, eventData]) => { if (!active) return; setVenues(venueData.venues); if (eventData) { const item = eventData.event; setVenueId(item.venueId); setTitle(item.title); setDescription(item.description); setCategory(item.category); setImageUrl(item.imageUrl); setStartsAt(localDateTime(item.startsAt)); setEndsAt(localDateTime(item.endsAt)); setSaleStartsAt(item.saleStartsAt ? localDateTime(item.saleStartsAt) : ""); setSaleEndsAt(item.saleEndsAt ? localDateTime(item.saleEndsAt) : ""); setTimezone(item.timezone); setCurrency(item.currency); setPrices(item.sectionPrices); setStatus(item.status); } else if (venueData.venues[0]) { const firstVenue = venueData.venues[0]; setVenueId(firstVenue.id); setPrices([...new Set(firstVenue.seats.map((seat) => seat.section))].map((section) => ({ section, amount: 0 }))); } })
      .catch((caught) => { if (active) setError(caught instanceof ApiError ? caught.message : "Unable to load event details."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accessToken, eventId]);
  const venue = venues.find((item) => item.id === venueId);
  function selectVenue(id: string) { setVenueId(id); const next = venues.find((venue) => venue.id === id); if (next) setPrices([...new Set(next.seats.map((seat) => seat.section))].map((section) => ({ section, amount: 0 }))); }
  function changePrice(section: string, amount: string) { setPrices((current) => current.map((price) => price.section === section ? { ...price, amount: Number(amount) } : price)); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSaving(true);
    try {
      const eventDetails = { title, description, category, imageUrl, startsAt, endsAt, saleStartsAt: saleStartsAt || undefined, saleEndsAt: saleEndsAt || undefined, timezone, currency, sectionPrices: prices };
      const body = eventId ? eventDetails : { venueId, ...eventDetails };
      const response = eventId ? await api<{ event: OrganizerEvent }>(`/organizer/events/${eventId}`, { method: "PATCH", ...auth(accessToken), body: JSON.stringify(body) }) : await api<{ event: OrganizerEvent }>("/organizer/events", { method: "POST", ...auth(accessToken), body: JSON.stringify(body) });
      navigate(`/organizer/events/${response.event.id}/edit`);
    } catch (caught) { setError(readableError(caught, "Unable to save the event.")); } finally { setSaving(false); }
  }
  async function publish() { if (!eventId) return; setError(""); setSaving(true); try { const result = await api<{ event: OrganizerEvent }>(`/organizer/events/${eventId}/publish`, { method: "POST", ...auth(accessToken) }); setStatus(result.event.status); } catch (caught) { setError(readableError(caught, "Unable to publish the event.")); } finally { setSaving(false); } }
  if (loading) return <section className="form-page"><p className="muted">Loading event workspace…</p></section>;
  if (!venues.length) return <section className="form-page"><EmptyState title="Create a venue first" text="Every event needs a venue so SeatLock can generate its event-seat inventory." action="Create venue" onAction={() => navigate("/organizer/venues/new")} /></section>;
  const published = status === "published";
  return <section className="form-page"><PageHeader eyebrow="ORGANIZER / EVENTS" title={eventId ? "Edit event" : "Create a draft event"} description={published ? "This event is published and its inventory is protected from edits." : "Saving creates one independent inventory seat for every venue seat."} />
    <form className="card management-form" onSubmit={(event) => void submit(event)}><label>Venue<select value={venueId} onChange={(event) => selectVenue(event.target.value)} disabled={Boolean(eventId) || published}>{venues.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.seatCount} seats</option>)}</select><small>A venue cannot change after the event inventory is generated.</small></label><label>Event title<input value={title} onChange={(event) => setTitle(event.target.value)} required disabled={published} placeholder="Live Music Night" /></label><label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} required minLength={10} maxLength={2000} disabled={published} placeholder="Tell customers what to expect." /></label><div className="form-columns"><label>Category<input value={category} onChange={(event) => setCategory(event.target.value)} required disabled={published} placeholder="Music" /></label><label>Currency<input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} required minLength={3} maxLength={3} disabled={published} /></label></div><label>Image URL <span className="optional">(optional)</span><input type="url" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} disabled={published} placeholder="https://example.com/event.jpg" /></label><div className="form-columns"><label>Starts at<input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required disabled={published} /></label><label>Ends at<input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} required disabled={published} /></label></div><div className="form-columns"><label>Ticket sales start <span className="optional">(optional)</span><input type="datetime-local" value={saleStartsAt} onChange={(event) => setSaleStartsAt(event.target.value)} disabled={published} /></label><label>Ticket sales end <span className="optional">(optional)</span><input type="datetime-local" value={saleEndsAt} onChange={(event) => setSaleEndsAt(event.target.value)} disabled={published} /></label></div><label>Timezone<input value={timezone} onChange={(event) => setTimezone(event.target.value)} required disabled={published} /></label><fieldset disabled={published}><legend>Ticket prices by section</legend>{prices.map((price) => <label key={price.section}>{price.section}<input type="number" value={price.amount} onChange={(event) => changePrice(price.section, event.target.value)} required min={0} step="0.01" /></label>)}</fieldset><ErrorMessage error={error} /><div className="form-actions">{!published && <button type="submit" disabled={saving}>{saving ? "Saving…" : eventId ? "Save draft" : "Create draft and inventory"}</button>}{eventId && !published && <button type="button" className="secondary" onClick={() => void publish()} disabled={saving}>Publish event</button>}<button type="button" className="text-button" onClick={() => navigate("/organizer/events")}>Back to events</button></div>{eventId && <p className="inventory-note">This event has {venue?.seatCount ?? 0} independent inventory seats, ready for seat locking in Part 5.</p>}</form>
  </section>;
}

function PageHeader({ eyebrow, title, description, action, onAction }: { eyebrow: string; title: string; description: string; action?: string; onAction?: () => void }) { return <div className="management-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{description}</p></div>{action && onAction && <button type="button" onClick={onAction}>{action}</button>}</div>; }
function EmptyState({ title, text, action, onAction }: { title: string; text: string; action: string; onAction: () => void }) { return <section className="card empty-state"><h2>{title}</h2><p>{text}</p><button type="button" onClick={onAction}>{action}</button></section>; }
