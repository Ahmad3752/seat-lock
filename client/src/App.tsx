import { useState, type FormEvent } from "react";
import { useAuth } from "./auth/useAuth";
import { ApiError } from "./lib/api";
import "./App.css";

type Mode = "login" | "register";

function App() {
  const { user, isLoading, login, register, logout } = useAuth();
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
      if (mode === "register") await register(name, email, password);
      else await login(email, password);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to complete that request.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) return <main className="page"><p className="muted">Restoring your session…</p></main>;

  return (
    <main className="page">
      <header className="brand"><span className="brand-mark">S</span><span>SeatLock</span></header>
      {user ? (
        <section className="card welcome-card" aria-labelledby="welcome-heading">
          <p className="eyebrow">SIGNED IN</p>
          <h1 id="welcome-heading">Welcome, {user.name}.</h1>
          <p className="muted">Your {user.role} account is ready for the next SeatLock feature.</p>
          <div className="account-row"><span>{user.email}</span><span className="role">{user.role}</span></div>
          <button type="button" className="secondary" onClick={() => void logout()}>Sign out</button>
        </section>
      ) : (
        <section className="card" aria-labelledby="auth-heading">
          <p className="eyebrow">ACCOUNT</p>
          <h1 id="auth-heading">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
          <p className="muted">{mode === "login" ? "Sign in to start reserving seats." : "Start as a customer. Organizer access is assigned securely."}</p>
          <form onSubmit={(event) => void submit(event)}>
            {mode === "register" && <label>Full name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required minLength={2} maxLength={80} /></label>}
            <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
            <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button type="submit" disabled={isSubmitting}>{isSubmitting ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
          </form>
          <p className="switch">{mode === "login" ? "New to SeatLock?" : "Already have an account?"} <button type="button" className="link" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "Create one" : "Sign in"}</button></p>
        </section>
      )}
    </main>
  );
}

export default App;
