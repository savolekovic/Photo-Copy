import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
import { I18nProvider } from "./i18n/I18nProvider.jsx";
import "./index.css";

// I18nProvider wraps AuthProvider because the auth layer reads the active locale in
// order to keep the account's stored language (used for e-mails) in sync.
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <I18nProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </I18nProvider>
  </React.StrictMode>
);
