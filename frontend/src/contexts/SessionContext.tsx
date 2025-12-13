'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export interface User {
  id: string;
  email: string;
  name: string;
  picture: string | null;
  google_id: string | null;
  is_admin: boolean;
  created_at: string;
  last_login_at: string;
}

interface SessionContextType {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  refreshSession: () => Promise<void>;
  clearSession: () => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSession = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8787';
      const response = await fetch(`${backendUrl}/api/users/me`, {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Not authenticated
          setUser(null);
          setError(null);
        } else {
          setError('Failed to fetch session');
        }
        return;
      }

      const data = await response.json();
      setUser(data.user);
    } catch (err) {
      console.error('Session fetch error:', err);
      setError('Network error');
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch session on mount
  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  const refreshSession = useCallback(async () => {
    await fetchSession();
  }, [fetchSession]);

  const clearSession = useCallback(() => {
    setUser(null);
    setError(null);
  }, []);

  return (
    <SessionContext.Provider
      value={{
        user,
        isLoading,
        error,
        refreshSession,
        clearSession,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}
