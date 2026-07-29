import { Navigate, Outlet } from "react-router";
import { useAuth } from "../contexts/AuthContext";

type ProtectedRouteProps = {
  adminOnly?: boolean;
};

export function ProtectedRoute({ adminOnly = false }: ProtectedRouteProps) {
  const { session, profile, loading, signOut } = useAuth();

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-600">Carregando...</p>
      </main>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <section className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
          <h1 className="text-xl font-bold text-slate-900">
            Perfil não encontrado
          </h1>

          <p className="mt-3 text-slate-600">
            Não foi possível carregar as informações deste usuário.
          </p>

          <button
            type="button"
            onClick={() => signOut()}
            className="mt-6 rounded-lg bg-slate-900 px-5 py-3 font-medium text-white"
          >
            Voltar ao login
          </button>
        </section>
      </main>
    );
  }

  if (adminOnly && profile.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
