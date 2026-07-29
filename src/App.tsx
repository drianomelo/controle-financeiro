import { Route, Routes } from "react-router";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./layouts/AppLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { InvoiceMonthPage } from "./pages/InvoiceMonthPage";
import { LoginPage } from "./pages/LoginPage";
import { CardsPage } from "./pages/CardsPage";
import { UsersPage } from "./pages/UsersPage";
import { ChargesPage } from "./pages/ChargesPage";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />

          <Route path="faturas/:year/:month" element={<InvoiceMonthPage />} />

          <Route element={<ProtectedRoute adminOnly />}>
            <Route path="cartoes" element={<CardsPage />} />

            <Route path="contas" element={<ChargesPage />} />

            <Route path="usuarios" element={<UsersPage />} />
          </Route>
        </Route>
      </Route>

      <Route
        path="*"
        element={
          <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
            <section className="text-center">
              <h1 className="text-5xl font-bold text-slate-900">404</h1>

              <p className="mt-3 text-slate-600">Página não encontrada.</p>
            </section>
          </main>
        }
      />
    </Routes>
  );
}

export default App;
