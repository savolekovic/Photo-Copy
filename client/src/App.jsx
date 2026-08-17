import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import OperatorLayout from "./components/OperatorLayout.jsx";
import RequireRole from "./auth/RequireRole.jsx";
import { useAuth } from "./auth/AuthContext.jsx";
import { useI18n } from "./i18n/I18nProvider.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import LoginVerifyPage from "./pages/LoginVerifyPage.jsx";
import MyOrdersPage from "./pages/MyOrdersPage.jsx";
import OrderFormPage from "./pages/OrderFormPage.jsx";
import OrdersPage from "./pages/OrdersPage.jsx";
import ReportPage from "./pages/ReportPage.jsx";

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

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>

        {/* Operator screens use the back-office shell, not the student header. */}
        <Route
          element={
            <RequireRole role="operator">
              <OperatorLayout />
            </RequireRole>
          }
        >
          <Route path="/narudzbine" element={<OrdersPage />} />
          <Route
            path="/administracija"
            element={<Navigate to="/administracija/fakulteti" replace />}
          />
          <Route path="/izvjestaj" element={<ReportPage />} />
          <Route path="/administracija/:section" element={<AdminPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
