import { createContext } from "react";

export type UserRole = "customer" | "organizer" | "admin";
export interface AuthUser { id: string; name: string; email: string; role: UserRole; }
export interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
