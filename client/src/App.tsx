import { useEffect, useState, type FormEvent, type PropsWithChildren } from "react";
import { useAuth } from "./auth/useAuth";
import type { AuthUser, UserRole } from "./auth/auth-context";
import { ApiError } from "./lib/api";
import { EventFormPage, EventListPage, VenueFormPage, VenueListPage } from "./organizer/OrganizerPages";
import { EventCataloguePage, PublicEventDetailPage } from "./public-events/PublicEventPages";
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

function RouteLink({ to, navigate, children, className }: PropsWithChildren<{ to: string; navigate: (to: string) => void; className?: string }>) {
  return <a className={className} href={to} onClick={(event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(to);
  }}>{children}</a>;
}

function Navigation({ user, navigate, logout }: { user: AuthUser; navigate: (to: string) => void; logout: () => Promise<void> }) {
  return <header className="site-header">
    <RouteLink to="/" navigate={navigate} className="brand"><span className="brand-mark">S</span><span>SeatLock</span></RouteLink>
    <nav aria-label="Main navigation">
      <RouteLink to="/events" navigate={navigate}>Events</RouteLink>
      {(user.role === "customer" || user.role === "organizer") && <RouteLink to="/dashboard" navigate={navigate}>Dashboard</RouteLink>}
      {user.role === "organizer" && <RouteLink to="/organizer" navigate={navigate}>Organizer</RouteLink>}
      {user.role === "admin" && <RouteLink to="/admin" navigate={navigate}>Admin</RouteLink>}
      <span className="role" title={`Signed in as ${user.email}`}>{user.role}</span>
      <button type="button" className="text-button" onClick={() => void logout().then(() => navigate("/"))}>Sign out</button>
    </nav>
  </header>;
}

function PublicNavigation({ navigate }: { navigate: (to: string) => void }) {
  return <header className="site-header">
    <RouteLink to="/events" navigate={navigate} className="brand"><span className="brand-mark">S</span><span>SeatLock</span></RouteLink>
    <nav aria-label="Main navigation"><RouteLink to="/events" navigate={navigate}>Events</RouteLink><RouteLink to="/login" navigate={navigate}>Sign in</RouteLink></nav>
  </header>;
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
    <p className="eyebrow">ACCOUNT</p>
    <h1 id="auth-heading">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
    <p className="muted">{mode === "login" ? "Customer sign-in uses your registered email and password." : "Start as a customer. Organizer access is assigned securely."}</p>
    <form onSubmit={(event) => void submit(event)}>
      {mode === "register" && <label>Full name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required minLength={2} maxLength={80} /></label>}
      <label>{mode === "login" ? "Email address or demo username" : "Email address"}<input type={mode === "login" ? "text" : "email"} value={email} onChange={(event) => setEmail(event.target.value)} autoComplete={mode === "login" ? "username" : "email"} required /></label>
      <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" disabled={isSubmitting}>{isSubmitting ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
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

function CustomerDashboard({ user }: { user: AuthUser }) {
  return <DashboardShell eyebrow="CUSTOMER DASHBOARD" title={`Welcome, ${user.name}.`} description="Keep track of your bookings and any seats you are currently holding.">
    <DashboardCard title="My bookings" text="Confirmed tickets will appear here after payment is added in Part 7." action="Browse events" />
    <DashboardCard title="Active seat holds" text="Your 10-minute seat holds will appear here in Part 5." action="No active holds" mutedAction />
  </DashboardShell>;
}

function OrganizerDashboard({ user, navigate }: { user: AuthUser; navigate: (to: string) => void }) {
  return <DashboardShell eyebrow="ORGANIZER DASHBOARD" title={`Manage your events, ${user.name}.`} description="This workspace is limited to venues and events that you own.">
    <DashboardCard title="My events" text="Create draft events, set prices, and publish when ready." action="Manage events" onAction={() => navigate("/organizer/events")} />
    <DashboardCard title="Venues" text="Build reusable venues and grid-based seating plans." action="Manage venues" onAction={() => navigate("/organizer/venues")} />
  </DashboardShell>;
}

function AdminDashboard({ user }: { user: AuthUser }) {
  return <DashboardShell eyebrow="ADMIN DASHBOARD" title={`Platform overview, ${user.name}.`} description="Platform-level controls are separated from organizer-owned work.">
    <DashboardCard title="Manage users" text="Review accounts and role assignments as administration features grow." action="User management" />
    <DashboardCard title="Manage events" text="Moderate events across all organizers when event management is added." action="Event moderation" />
  </DashboardShell>;
}

function DashboardShell({ eyebrow, title, description, children }: PropsWithChildren<{ eyebrow: string; title: string; description: string }>) {
  return <section className="dashboard" aria-labelledby="dashboard-heading"><div className="dashboard-intro"><p className="eyebrow">{eyebrow}</p><h1 id="dashboard-heading">{title}</h1><p className="muted">{description}</p></div><div className="dashboard-grid">{children}</div></section>;
}

function DashboardCard({ title, text, action, mutedAction = false, onAction }: { title: string; text: string; action: string; mutedAction?: boolean; onAction?: () => void }) {
  return <article className="card dashboard-card"><h2>{title}</h2><p>{text}</p><button type="button" className={mutedAction ? "secondary" : ""} disabled={mutedAction} onClick={onAction}>{action}</button></article>;
}

function App() {
  const { user, isLoading, logout } = useAuth();
  const { pathname, navigate } = usePathname();
  if (isLoading) return <main className="loading-page"><p className="muted">Restoring your session…</p></main>;
  const eventSlug = /^\/events\/([^/]+)$/.exec(pathname)?.[1];
  if (pathname === "/events" || eventSlug) return <main className="app-page"><PublicNavigation navigate={navigate} />{pathname === "/events" ? <EventCataloguePage navigate={navigate} /> : <PublicEventDetailPage key={eventSlug} slug={eventSlug!} navigate={navigate} user={user} />}</main>;
  if (!user) {
    const returnTo = new URLSearchParams(window.location.search).get("returnTo") ?? undefined;
    return <main className="auth-page"><header className="brand"><span className="brand-mark">S</span><span>SeatLock</span></header><AuthScreen navigate={navigate} returnTo={returnTo} /></main>;
  }

  let content;
  if (pathname === "/") content = <section className="card dashboard-card"><p className="eyebrow">SIGNED IN</p><h1>Welcome, {user.name}.</h1><p className="muted">Your {user.role} account is ready.</p><button type="button" onClick={() => navigate(defaultPath(user.role))}>Open my dashboard</button></section>;
  else if (pathname === "/dashboard") content = user.role === "customer" || user.role === "organizer" ? <CustomerDashboard user={user} /> : <AccessDenied user={user} navigate={navigate} />;
  else if (pathname === "/organizer/venues") content = user.role === "organizer" || user.role === "admin" ? <VenueListPage navigate={navigate} /> : <AccessDenied user={user} navigate={navigate} />;
  else if (pathname === "/organizer/venues/new") content = user.role === "organizer" || user.role === "admin" ? <VenueFormPage navigate={navigate} /> : <AccessDenied user={user} navigate={navigate} />;
  else if (/^\/organizer\/venues\/[^/]+\/edit$/.test(pathname)) content = user.role === "organizer" || user.role === "admin" ? <VenueFormPage navigate={navigate} venueId={pathname.split("/")[3]} /> : <AccessDenied user={user} navigate={navigate} />;
  else if (pathname === "/organizer/events") content = user.role === "organizer" || user.role === "admin" ? <EventListPage navigate={navigate} /> : <AccessDenied user={user} navigate={navigate} />;
  else if (pathname === "/organizer/events/new") content = user.role === "organizer" || user.role === "admin" ? <EventFormPage navigate={navigate} /> : <AccessDenied user={user} navigate={navigate} />;
  else if (/^\/organizer\/events\/[^/]+\/edit$/.test(pathname)) content = user.role === "organizer" || user.role === "admin" ? <EventFormPage navigate={navigate} eventId={pathname.split("/")[3]} /> : <AccessDenied user={user} navigate={navigate} />;
  else if (pathname === "/organizer") content = user.role === "organizer" || user.role === "admin" ? <OrganizerDashboard user={user} navigate={navigate} /> : <AccessDenied user={user} navigate={navigate} />;
  else if (pathname === "/admin") content = user.role === "admin" ? <AdminDashboard user={user} /> : <AccessDenied user={user} navigate={navigate} />;
  else content = <AccessDenied user={user} navigate={navigate} />;
  return <main className="app-page"><Navigation user={user} navigate={navigate} logout={logout} />{content}</main>;
}

export default App;
