import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { api } from "../lib/api";
import { AuthContext, type AuthUser } from "./auth-context";

interface AuthResponse { user: AuthUser; accessToken: string; }

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const applySession = useCallback((session: AuthResponse) => { setUser(session.user); setAccessToken(session.accessToken); }, []);

  useEffect(() => {
    let active = true;
    void api<AuthResponse>("/auth/refresh", { method: "POST" })
      .then((session) => { if (active) applySession(session); })
      .catch(() => { if (active) { setUser(null); setAccessToken(null); } })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [applySession]);

  const login = useCallback(async (email: string, password: string) => {
    applySession(await api<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }));
  }, [applySession]);
  const register = useCallback(async (name: string, email: string, password: string) => {
    applySession(await api<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) }));
  }, [applySession]);
  const logout = useCallback(async () => {
    try {
      if (accessToken) await api<void>("/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
    } finally {
      setUser(null);
      setAccessToken(null);
    }
  }, [accessToken]);

  const value = useMemo(() => ({ user, accessToken, isLoading, login, register, logout }), [user, accessToken, isLoading, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

