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
  // Set once a login link has been redeemed. The initial /me may still be in flight at
  // that point, and if it was issued under a previous session it would otherwise resolve
  // afterwards and overwrite the freshly signed-in account.
  const verifiedRef = useRef(false);

  const refresh = useCallback(async (signal, { initial = false } = {}) => {
    try {
      const data = await api.fetchMe({ signal });
      // A verify() that landed while this was in flight is the newer truth.
      if (initial && verifiedRef.current) return data.user ?? null;
      setUser(data.user ?? null);
      return data.user ?? null;
    } catch (err) {
      // Rethrow aborts so the caller can tell "cancelled" from "not signed in" — they
      // must be treated differently, see below.
      if (err.name === "AbortError") throw err;
      // A failed /me means "not signed in" as far as the UI is concerned.
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        await refresh(ac.signal, { initial: true });
        setLoading(false);
      } catch {
        // Aborted, so the session is still unknown and `loading` must stay true.
        // StrictMode double-invokes this effect and the cleanup cancels the first call;
        // clearing `loading` here would briefly report "not signed in" and bounce the
        // user off any guarded route they loaded directly.
      }
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
    verifiedRef.current = true;
    setUser(data.user);
    setLoading(false);
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
      verifiedRef.current = false;
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
