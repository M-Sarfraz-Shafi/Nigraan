import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { CurrentUser } from "../api/types";

export function useAuth() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const u = await api.me();
        setUser(u);
      } catch {
        setUser(null);
        try {
          const { needsSetup: ns } = await api.setupStatus();
          setNeedsSetup(ns);
        } catch {
          // ignore — treat as not needing setup if the check itself fails
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const u = await api.login(username, password);
    setUser(u);
    return u;
  }, []);

  const completeSetup = useCallback(async (username: string, password: string, displayName: string) => {
    const u = await api.setup(username, password, displayName);
    setUser(u);
    setNeedsSetup(false);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setUser(null);
  }, []);

  return { user, needsSetup, loading, login, completeSetup, logout };
}
