const STORAGE_KEY = "photocopy_admin_secret";

export function getAdminSecret() {
  if (typeof sessionStorage === "undefined") return "";
  return (
    sessionStorage.getItem(STORAGE_KEY) ||
    import.meta.env.VITE_ADMIN_SECRET ||
    ""
  );
}

export function setAdminSecret(value) {
  if (typeof sessionStorage === "undefined") return;
  if (value) {
    sessionStorage.setItem(STORAGE_KEY, value.trim());
  } else {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}
