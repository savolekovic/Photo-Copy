import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import RequireRole from "./auth/RequireRole.jsx";
import { useAuth } from "./auth/AuthContext.jsx";
import { useI18n } from "./i18n/I18nProvider.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import LoginVerifyPage from "./pages/LoginVerifyPage.jsx";
import MyOrdersPage from "./pages/MyOrdersPage.jsx";
import OrderFormPage from "./pages/OrderFormPage.jsx";
import OrdersPage from "./pages/OrdersPage.jsx";

/**
 * "/" means different things per role: a student lands on the order form, an operator on
 * the order queue. Resolved here rather than with two competing routes.
 */
function RoleHome() {
  const { user, loading } = useAuth();
  const { t } = useI18n();

  if (loading) {
    return (
      <p className="py-24 text-center text-sm text-slate-500">{t("common.loading")}</p>
    );
  }
  if (!user) return <Navigate to="/prijava" replace />;
  if (user.role === "operator") return <Navigate to="/narudzbine" replace />;
  return <OrderFormPage />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/prijava" element={<LoginPage />} />
          <Route path="/prijava/potvrda" element={<LoginVerifyPage />} />

          <Route path="/" element={<RoleHome />} />

          <Route
            path="/moje-narudzbine"
            element={
              <RequireRole role="student">
                <MyOrdersPage />
              </RequireRole>
            }
          />

          <Route
            path="/narudzbine"
            element={
              <RequireRole role="operator">
                <OrdersPage />
              </RequireRole>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
