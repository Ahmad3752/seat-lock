import { useEffect, useState, type FormEvent, type PropsWithChildren } from "react";
import { useAuth } from "./auth/useAuth";
import type { AuthUser, UserRole } from "./auth/auth-context";
import { ApiError } from "./lib/api";
import { EventFormPage, EventListPage, VenueFormPage, VenueListPage } from "./organizer/OrganizerPages";
import { EventCataloguePage, PublicEventDetailPage } from "./public-events/PublicEventPages";
import { BookingHistory } from "./bookings/BookingHistory";
import { EventReport } from "./organizer/EventReport";
import { AdminPage } from "./admin/AdminPage";
import { BrandMark, Icon, TicketArtwork } from "./components/Icon";
import "./App.css";

type Mode = "login" | "register";

function defaultPath(role: UserRole) {
  if (role === "organizer") return "/organizer";
  if (role === "admin") return "/admin";
  return "/dashboard";
}

function usePathname() {
  const [pathname, setPathname] = useState(window.location.pathname);
  useEffect(() => {
    const update = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  function navigate(to: string) {
    if (to === window.location.pathname) return;
    window.history.pushState({}, "", to);
    setPathname(to);
  }
  return { pathname, navigate };
}

function RouteLink({ to, navigate, children, className, active }: PropsWithChildren<{ to: string; navigate: (to: string) => void; className?: string; active?: boolean }>) {
  return <a className={className} href={to} aria-current={active ? "page" : undefined} onClick={(event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(to);
  }}>{children}</a>;
}

function Navigation({ user, navigate, logout, pathname }: { user: AuthUser; navigate: (to: string) => void; logout: () => Promise<void>; pathname: string }) {
  return <header className="site-header"><div className="header-inner header-inner-authenticated">
    <RouteLink to="/events" navigate={navigate} className="brand"><BrandMark /><span>SeatLock<span className="brand-dot">.</span></span></RouteLink>
    <nav aria-label="Main navigation">
      <div className="nav-links">
        <RouteLink to="/events" navigate={navigate} active={pathname.startsWith("/events")}><Icon name="search" />Events</RouteLink>
        {(user.role === "customer" || user.role === "organizer") && <RouteLink to="/dashboard" navigate={navigate} active={pathname === "/dashboard" || pathname === "/my-bookings"}><Icon name="ticket" />My bookings</RouteLink>}
        {user.role === "organizer" && <RouteLink to="/organizer" navigate={navigate} active={pathname.startsWith("/organizer")}><Icon name="grid" />Organizer</RouteLink>}
        {user.role === "admin" && <RouteLink to="/admin" navigate={navigate} active={pathname.startsWith("/admin")}><Icon name="shield" />Admin</RouteLink>}
      </div>
      <div className="nav-account"><span className="role" title={`Signed in as ${user.email}`}>{user.role}</span>
        <button type="button" className="text-button" onClick={() => void logout().then(() => navigate("/"))}><Icon name="logout" />Sign out</button>
      </div>
    </nav>
  </div></header>;
}

function PublicNavigation({ navigate }: { navigate: (to: string) => void }) {
  return <header className="site-header"><div className="header-inner">
    <RouteLink to="/events" navigate={navigate} className="brand"><BrandMark /><span>SeatLock<span className="brand-dot">.</span></span><span className="brand-descriptor">Experiences worth showing up for.</span></RouteLink>
    <nav aria-label="Main navigation"><RouteLink to="/events" navigate={navigate} active={window.location.pathname === "/events"}>Explore events</RouteLink><RouteLink to="/login" navigate={navigate} className="nav-signin">Sign in<Icon name="arrow" /></RouteLink></nav>
  </div></header>;
}

function AppShell({ user, navigate, logout, pathname, children }: PropsWithChildren<{ user: AuthUser | null; navigate: (to: string) => void; logout: () => Promise<void>; pathname: string }>) {
  return <div className="app-page">
    <a className="skip-link" href="#main-content">Skip to content</a>
    {user ? <Navigation user={user} navigate={navigate} logout={logout} pathname={pathname} /> : <PublicNavigation navigate={navigate} />}
    <main className="page-content" id="main-content" tabIndex={-1}>{children}</main>
    <footer className="site-footer"><RouteLink to="/events" navigate={navigate} className="brand"><BrandMark /><span>SeatLock.</span></RouteLink><p className="footer-note">Discover the moment. Find your seat.</p><span>Made for memorable experiences.</span></footer>
  </div>;
}

function AuthScreen({ navigate, returnTo }: { navigate: (to: string) => void; returnTo?: string }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const signedInUser = mode === "register" ? await register(name, email, password) : await login(email, password);
      navigate(returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : defaultPath(signedInUser.role));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to complete that request.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function signInWithDemo(username: "organizer" | "admin") {
    setError("");
    setIsSubmitting(true);
    try {
      const signedInUser = await login(username, "12345678");
      navigate(defaultPath(signedInUser.role));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to complete that request.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return <section className="card auth-card" aria-labelledby="auth-heading">
    <div className="auth-lock"><Icon name="user" /></div>
    <p className="eyebrow">YOUR SEATLOCK ACCOUNT</p>
    <h1 id="auth-heading">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
    <p className="muted">{mode === "login" ? "Sign in to find your next experience and keep your tickets in one place." : "Your next great experience starts here. Create your customer account to get started."}</p>
    <form onSubmit={(event) => void submit(event)}>
      {mode === "register" && <label>Full name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required minLength={2} maxLength={80} /></label>}
      <label>{mode === "login" ? "Email address or demo username" : "Email address"}<input type={mode === "login" ? "text" : "email"} value={email} onChange={(event) => setEmail(event.target.value)} autoComplete={mode === "login" ? "username" : "email"} placeholder="you@example.com" required /></label>
      <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" disabled={isSubmitting}>{isSubmitting ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}<Icon name="arrow" /></button>
    </form>
    {mode === "login" && <div className="demo-logins">
      <p className="demo-title">Development role demos</p>
      <p>Use these local-only accounts to see the organizer and admin areas.</p>
      <div className="demo-actions">
        <button type="button" className="secondary" disabled={isSubmitting} onClick={() => void signInWithDemo("organizer")}>Sign in as organizer</button>
        <button type="button" className="secondary" disabled={isSubmitting} onClick={() => void signInWithDemo("admin")}>Sign in as admin</button>
      </div>
      <p className="demo-credentials">Organizer: <code>organizer</code> · Admin: <code>admin</code> · Password: <code>12345678</code></p>
    </div>}
    <p className="switch">{mode === "login" ? "New to SeatLock?" : "Already have an account?"} <button type="button" className="link" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "Create one" : "Sign in"}</button></p>
  </section>;
}

function AccessDenied({ user, navigate }: { user: AuthUser; navigate: (to: string) => void }) {
  return <section className="card dashboard-card"><p className="eyebrow">RESTRICTED</p><h1>This page is not available to your role.</h1><p className="muted">You are signed in as a {user.role}. Use your dashboard to continue.</p><button type="button" onClick={() => navigate(defaultPath(user.role))}>Go to my dashboard</button></section>;
}

function OrganizerDashboard({ user, navigate }: { user: AuthUser; navigate: (to: string) => void }) {
  return <DashboardShell eyebrow="ORGANIZER WORKSPACE" title={`Make it memorable, ${user.name}.`} description="From the first seat to the final curtain. Everything you need to bring your events together.">
    <DashboardCard icon="calendar" title="My events" text="Create your next event, fine-tune the details, and publish when you're ready." action="Manage events" onAction={() => navigate("/organizer/events")} />
    <DashboardCard icon="venue" title="Venues & seating" text="Give every guest a great spot with reusable venues and clear seating plans." action="Manage venues" onAction={() => navigate("/organizer/venues")} />
  </DashboardShell>;
}

function DashboardShell({ eyebrow, title, description, children }: PropsWithChildren<{ eyebrow: string; title: string; description: string }>) {
  return <section className="dashboard" aria-labelledby="dashboard-heading"><div className="dashboard-intro"><p className="eyebrow">{eyebrow}</p><h1 id="dashboard-heading">{title}</h1><p className="muted">{description}</p></div><div className="dashboard-grid">{children}</div></section>;
}

function DashboardCard({ title, text, action, icon = "ticket", mutedAction = false, onAction }: { title: string; text: string; action: string; icon?: "calendar" | "venue" | "ticket"; mutedAction?: boolean; onAction?: () => void }) {
  return <article className="card dashboard-card"><div className="dashboard-card-icon"><Icon name={icon} /></div><h2>{title}</h2><p>{text}</p><button type="button" className={mutedAction ? "secondary" : ""} disabled={mutedAction} onClick={onAction}>{action}<Icon name="arrow" /></button></article>;
}

function App() {
  const { user, isLoading, logout } = useAuth();
  const { pathname, navigate } = usePathname();
  if (isLoading) return <main className="loading-page"><BrandMark /><p className="muted" role="status">Restoring your session…</p></main>;
  const eventSlug = /^\/events\/([^/]+)$/.exec(pathname)?.[1];
  if (pathname === "/events" || eventSlug) return <AppShell user={user} navigate={navigate} logout={logout} pathname={pathname}>{pathname === "/events" ? <EventCataloguePage navigate={navigate} /> : <PublicEventDetailPage key={eventSlug} slug={eventSlug!} navigate={navigate} user={user} />}</AppShell>;
  if (!user) {
    const returnTo = new URLSearchParams(window.location.search).get("returnTo") ?? undefined;
    return <main className="auth-page"><aside className="auth-story"><RouteLink to="/events" navigate={navigate} className="brand"><BrandMark /><span>SeatLock<span className="brand-dot">.</span></span></RouteLink><div className="auth-story-body"><p className="eyebrow">BE THERE FOR IT.</p><div className="auth-story-title">Less ordinary.<br /><span>More unforgettable.</span></div><p>Discover events you love. Choose your spot. Make room for your next great memory.</p><TicketArtwork /></div><p className="auth-story-footer"><Icon name="ticket" />Your next experience is just a seat away.</p></aside><div className="auth-main"><RouteLink to="/events" navigate={navigate} className="text-button back-link">← Back to events</RouteLink><AuthScreen navigate={navigate} returnTo={returnTo} /></div></main>;
  }

  let content;
  if (pathname === "/") content = <section className="card dashboard-card"><p className="eyebrow">SIGNED IN</p><h1>Welcome, {user.name}.</h1><p className="muted">Your {user.role} account is ready.</p><button type="button" onClick={() => navigate(defaultPath(user.role))}>Open my dashboard</button></section>;
  else if (pathname === "/dashboard") content = user.role === "customer" || user.role === "organizer" ? <BookingHistory navigate={navigate} /> : <AccessDenied user={user} navigate={navigate} />;
  else if (pathname === "/my-bookings") content = user.role === "customer" || user.role === "organizer" ? <BookingHistory navigate={navigate} /> : <AccessDenied user={user} navigate={navigate} />;
  else if (pathname === "/organizer/venues") content = user.role === "organizer" || user.role === "admin" ? <VenueListPage navigate={navigate} /> : <AccessDenied user={user} navigate={navigate} />;
  else if (pathname === "/organizer/venues/new") content = user.role === "organizer" || user.role === "admin" ? <VenueFormPage navigate={navigate} /> : <AccessDenied user={user} navigate={navigate} />;
  else if (/^\/organizer\/venues\/[^/]+\/edit$/.test(pathname)) content = user.role === "organizer" || user.role === "admin" ? <VenueFormPage navigate={navigate} venueId={pathname.split("/")[3]} /> : <AccessDenied user={user} navigate={navigate} />;
  else if (pathname === "/organizer/events") content = user.role === "organizer" || user.role === "admin" ? <EventListPage navigate={navigate} /> : <AccessDenied user={user} navigate={navigate} />;
  else if (pathname === "/organizer/events/new") content = user.role === "organizer" || user.role === "admin" ? <EventFormPage navigate={navigate} /> : <AccessDenied user={user} navigate={navigate} />;
  else if (/^\/organizer\/events\/[^/]+\/report$/.test(pathname)) content = user.role === "organizer" || user.role === "admin" ? <EventReport navigate={navigate} eventId={pathname.split("/")[3]!} /> : <AccessDenied user={user} navigate={navigate} />;
  else if (/^\/organizer\/events\/[^/]+\/edit$/.test(pathname)) content = user.role === "organizer" || user.role === "admin" ? <EventFormPage navigate={navigate} eventId={pathname.split("/")[3]} /> : <AccessDenied user={user} navigate={navigate} />;
  else if (pathname === "/organizer") content = user.role === "organizer" || user.role === "admin" ? <OrganizerDashboard user={user} navigate={navigate} /> : <AccessDenied user={user} navigate={navigate} />;
  else if (pathname === "/admin") content = user.role === "admin" ? <AdminPage navigate={navigate} /> : <AccessDenied user={user} navigate={navigate} />;
  else content = <AccessDenied user={user} navigate={navigate} />;
  return <AppShell user={user} navigate={navigate} logout={logout} pathname={pathname}>{content}</AppShell>;
}

export default App;
