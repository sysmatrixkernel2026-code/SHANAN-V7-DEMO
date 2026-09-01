import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const TOKEN_KEY = 'shanan_auth_token';

interface AuthContextValue {
  user: SafeUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<SafeUser>;
  logout: () => void;
}

interface SafeUser {
  id: string;
  name: string;
  email: string;
  userType: 'internal' | 'customer' | 'supplier';
  role: string;
  companyId: string | null;
  supplierId: string | null;
  isActive: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount: check for stored token and validate
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (!storedToken) {
      setIsLoading(false);
      return;
    }
    // Validate token by calling /api/auth/me
    fetch(`${API_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${storedToken}` },
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.user) {
          setUser(data.user);
          setToken(storedToken);
        } else {
          localStorage.removeItem(TOKEN_KEY);
        }
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Login failed');
    }
    const data = await res.json();
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
    setToken(data.token);
    return data.user;
  };

  const logout = () => {
    if (token) {
      fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// Helper for authenticated fetch
export function authFetch(url: string, token: string, options: RequestInit = {}) {
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
    },
  });
}
