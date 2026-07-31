/**
 * Turns an ApiError into a translated sentence.
 *
 * The server sends a stable `code` alongside its English message; the code is what we
 * translate. The raw server message is only used as a last resort, so an untranslated
 * string is still better than a blank error.
 */
export function apiErrorMessage(err, t, vars = {}) {
  if (!err) return "";

  if (err.code) {
    const key = `auth.error.${err.code}`;
    const translated = t(key, vars);
    // t() returns the key itself when there is no entry for it.
    if (translated !== key) return translated;
  }

  if (err.name === "TypeError") {
    // fetch() rejects with TypeError when the network or server is unreachable.
    return t("common.somethingWrong");
  }

  return err.message || t("common.somethingWrong");
}
