import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { formatCurrencyFromCents } from "../utils/currency";
import { DashboardPage } from "./DashboardPage";
import { UserAvatar } from "../components/UserAvatar";
import { ChevronDown, Sliders, Trash2 } from "lucide-react";

type HomeUser = {
  id: string;
  name: string;
  username: string;
  salary_cents: number;
  avatar_path: string | null;
};

export function HomePage() {
  const { profile } = useAuth();

  const [users, setUsers] = useState<HomeUser[]>([]);

  const [loading, setLoading] = useState(true);

  const [errorMessage, setErrorMessage] = useState("");

  const loadUsers = useCallback(async () => {
    if (profile?.role !== "admin") {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("profiles")
      .select(
        `
        id,
        name,
        username,
        salary_cents,
        avatar_path
      `,
      )
      .eq("active", true)
      .order("name", {
        ascending: true,
      });

    if (error) {
      console.error("Erro ao carregar familiares:", error);

      setErrorMessage("Não foi possível carregar os familiares.");

      setLoading(false);
      return;
    }

    const loadedUsers = (data ?? []) as HomeUser[];

    setUsers(loadedUsers);
    setLoading(false);
  }, [profile?.role]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  if (profile?.role !== "admin") {
    return <DashboardPage />;
  }

  return (
    <section className="flex gap-10">
      <aside className="w-87.5 h-full ">
        <div className="flex items-center justify-between mb-1">
          <span className="flex items-center gap-1.5 font-semibold text-lg">
            <Sliders size={14} className="rotate-90 mb-px" />
            Filtros
          </span>

          <span className="flex items-center font-medium gap-1.5 text-sm text-red-400">
            <Trash2 size={14} className="mb-0.5" />
            Limpar tudo
          </span>
        </div>

        <div className="flex items-center justify-between mb-3 pb-3 pt-3.5 rounded-xl px-5 text-sm font-semibold bg-indigo-100 border border-indigo-300">
          <span>Seleção atual</span>

          <span className="flex items-center">
            Nenhum filtro <ChevronDown size={14}/>
          </span>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl">
          <div className="px-6 pb-3 pt-3.5 text-center bg-slate-100 rounded-t-xl font-semibold text-slate-500">
            Melo Finance
          </div>

          <div className="p-6 border-t border-slate-200"></div>
        </div>
      </aside>

      <div className="flex-1">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="mt-1 text-3xl font-bold text-slate-900">
              Familiares
            </h2>

            <p className="mt-2 text-slate-600">
              Selecione um familiar para visualizar suas faturas e projeções
              financeiras.
            </p>
          </div>

          <button
            type="button"
            onClick={loadUsers}
            disabled={loading}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>

        {errorMessage && (
          <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {loading && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
            Carregando familiares...
          </div>
        )}

        {!loading && users.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <h3 className="font-semibold text-slate-900">
              Nenhum familiar ativo
            </h3>

            <p className="mt-2 text-sm text-slate-500">
              Cadastre ou ative um usuário para começar.
            </p>
          </div>
        )}

        {!loading && users.length > 0 && (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {users.map((user) => (
              <Link
                key={user.id}
                to={`/usuarios/${user.id}/faturas`}
                className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <UserAvatar
                    name={user.name}
                    avatarPath={user.avatar_path}
                    size={80}
                    className="ring-4 ring-slate-100"
                  />

                  <span className="text-2xl text-blue-600 transition group-hover:translate-x-1">
                    →
                  </span>
                </div>

                <div className="mt-5">
                  <h3 className="text-xl font-bold text-slate-900">
                    {user.name}
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    @{user.username}
                  </p>
                </div>

                <div className="mt-5 border-t border-slate-100 pt-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Salário mensal
                  </p>

                  <p className="mt-1 text-lg font-bold text-slate-900">
                    {formatCurrencyFromCents(user.salary_cents)}
                  </p>
                </div>

                <div className="mt-5 flex items-center justify-between">
                  <span className="text-sm font-medium text-blue-600">
                    Ver faturas por mês
                  </span>

                  <span className="text-sm text-slate-400">12 meses</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
