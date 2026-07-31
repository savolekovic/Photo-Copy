import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../api.js";
import { useI18n } from "../i18n/I18nProvider.jsx";

/**
 * Session state for the whole app. The session itself lives in an httpOnly cookie, so
 * this context holds only the identity the server reports back from /api/auth/me.
 */

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Starts true: until /me answers we don't know whether we're signed in, and rendering
  // a login screen in the meantime would flash for already-authenticated users.
  const [loading, setLoading] = useState(true);
  const { locale } = useI18n();
  const syncedLocaleRef = useRef(null);

  const refresh = useCallback(async (signal) => {
    try {
      const data = await api.fetchMe({ signal });
      setUser(data.user ?? null);
      return data.user ?? null;
    } catch (err) {
      if (err.name === "AbortError") return null;
      // A failed /me means "not signed in" as far as the UI is concerned.
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      await refresh(ac.signal);
      setLoading(false);
    })();
    return () => ac.abort();
  }, [refresh]);

  /**
   * Keep the account's stored locale aligned with the language actually in use, so
   * e-mails arrive in the same language as the interface. The UI choice wins, because
   * it is the more recent signal.
   */
  useEffect(() => {
    if (!user || user.locale === locale) return;
    if (syncedLocaleRef.current === locale) return;
    syncedLocaleRef.current = locale;
    api
      .updateLocale(locale)
      .then((data) => setUser(data.user))
      .catch(() => {
        // Cosmetic preference; a failure here must not disrupt the session.
        syncedLocaleRef.current = null;
      });
  }, [user, locale]);

  const requestLink = useCallback(
    (email, indexNumber) => api.requestLoginLink({ email, indexNumber }),
    []
  );

  const verify = useCallback(async (token) => {
    const data = await api.verifyLoginToken(token);
    setUser(data.user);
    return data.user;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      // Clear locally even if the request failed, so the UI never claims to be signed
      // in against a session the server has already dropped.
      setUser(null);
      syncedLocaleRef.current = null;
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      isStudent: user?.role === "student",
      isOperator: user?.role === "operator",
      requestLink,
      verify,
      signOut,
      refresh,
    }),
    [user, loading, requestLink, verify, signOut, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
