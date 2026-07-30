import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { formatCurrencyFromCents } from "../utils/currency";
import { DashboardPage } from "./DashboardPage";

type HomeUser = {
  id: string;
  name: string;
  username: string;
  salary_cents: number;
  avatar_path: string | null;
};

type UserAvatarProps = {
  name: string;
  imageUrl?: string | null;
};

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function UserAvatar({ name, imageUrl }: UserAvatarProps) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={`Foto de ${name}`}
        className="h-20 w-20 rounded-full object-cover ring-4 ring-slate-100"
      />
    );
  }

  return (
    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 text-xl font-bold text-blue-700 ring-4 ring-slate-100">
      {getInitials(name)}
    </div>
  );
}

export function HomePage() {
  const { profile } = useAuth();

  const [users, setUsers] = useState<HomeUser[]>([]);

  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});

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

    const usersWithAvatar = loadedUsers.filter((user) =>
      Boolean(user.avatar_path),
    );

    const signedUrls = await Promise.all(
      usersWithAvatar.map(async (user) => {
        if (!user.avatar_path) {
          return null;
        }

        const { data: signedData, error: signedError } = await supabase.storage
          .from("avatars")
          .createSignedUrl(user.avatar_path, 60 * 60);

        if (signedError) {
          console.error(`Erro ao carregar foto de ${user.name}:`, signedError);

          return null;
        }

        return [user.id, signedData.signedUrl] as const;
      }),
    );

    const loadedAvatarUrls: Record<string, string> = {};

    signedUrls.forEach((entry) => {
      if (entry) {
        loadedAvatarUrls[entry[0]] = entry[1];
      }
    });

    setAvatarUrls(loadedAvatarUrls);
    setLoading(false);
  }, [profile?.role]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  /*
   * Usuários comuns continuam visualizando
   * diretamente o próprio dashboard.
   */
  if (profile?.role !== "admin") {
    return <DashboardPage />;
  }

  return (
    <section>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-600">
            Visão administrativa
          </p>

          <h2 className="mt-1 text-3xl font-bold text-slate-900">Familiares</h2>

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
                <UserAvatar name={user.name} imageUrl={avatarUrls[user.id]} />

                <span className="text-2xl text-blue-600 transition group-hover:translate-x-1">
                  →
                </span>
              </div>

              <div className="mt-5">
                <h3 className="text-xl font-bold text-slate-900">
                  {user.name}
                </h3>

                <p className="mt-1 text-sm text-slate-500">@{user.username}</p>
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
    </section>
  );
}
