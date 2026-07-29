import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";

type UserProfile = {
  id: string;
  name: string;
  username: string;
  role: "admin" | "common";
  active: boolean;
  created_at: string;
};

type UserForm = {
  name: string;
  role: "admin" | "common";
};

const emptyForm: UserForm = {
  name: "",
  role: "common",
};

export function UsersPage() {
  const { profile: currentProfile } = useAuth();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);

  const [form, setForm] = useState<UserForm>(emptyForm);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [changingUserId, setChangingUserId] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("profiles")
      .select(
        `
          id,
          name,
          username,
          role,
          active,
          created_at
        `,
      )
      .order("role", {
        ascending: true,
      })
      .order("name", {
        ascending: true,
      });

    if (error) {
      console.error("Erro ao carregar usuários:", error);

      setErrorMessage("Não foi possível carregar os usuários.");

      setLoading(false);
      return;
    }

    setUsers((data ?? []) as UserProfile[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  function clearMessages() {
    setErrorMessage("");
    setSuccessMessage("");
  }

  function resetForm() {
    setEditingUser(null);
    setForm(emptyForm);
  }

  function startEditing(user: UserProfile) {
    clearMessages();

    setEditingUser(user);

    setForm({
      name: user.name,
      role: user.role,
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function cancelEditing() {
    clearMessages();
    resetForm();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();

    if (!editingUser) {
      return;
    }

    const normalizedName = form.name.trim();

    if (!normalizedName) {
      setErrorMessage("Informe o nome do usuário.");
      return;
    }

    const isCurrentUser = editingUser.id === currentProfile?.id;

    const role = isCurrentUser ? editingUser.role : form.role;

    setSubmitting(true);

    const { error } = await supabase
      .from("profiles")
      .update({
        name: normalizedName,
        role,
      })
      .eq("id", editingUser.id);

    if (error) {
      console.error("Erro ao atualizar usuário:", error);

      setErrorMessage("Não foi possível atualizar o usuário.");

      setSubmitting(false);
      return;
    }

    resetForm();

    setSuccessMessage("Usuário atualizado com sucesso.");

    await loadUsers();
    setSubmitting(false);
  }

  async function toggleUserStatus(user: UserProfile) {
    clearMessages();

    if (user.id === currentProfile?.id) {
      setErrorMessage("Você não pode desativar seu próprio usuário.");
      return;
    }

    const action = user.active ? "desativar" : "ativar";

    const confirmed = window.confirm(
      `Deseja ${action} o usuário "${user.name}"?`,
    );

    if (!confirmed) {
      return;
    }

    setChangingUserId(user.id);

    const { error } = await supabase
      .from("profiles")
      .update({
        active: !user.active,
      })
      .eq("id", user.id);

    if (error) {
      console.error("Erro ao alterar usuário:", error);

      setErrorMessage("Não foi possível alterar o status do usuário.");

      setChangingUserId(null);
      return;
    }

    setSuccessMessage(
      user.active
        ? "Usuário desativado com sucesso."
        : "Usuário ativado com sucesso.",
    );

    await loadUsers();
    setChangingUserId(null);
  }

  return (
    <section>
      <div>
        <p className="text-sm font-medium text-blue-600">Administração</p>

        <h2 className="mt-1 text-3xl font-bold text-slate-900">Usuários</h2>

        <p className="mt-2 text-slate-600">
          Gerencie os familiares que possuem acesso ao sistema.
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <h3 className="font-semibold text-blue-900">
          Como adicionar um familiar
        </h3>

        <p className="mt-2 text-sm leading-6 text-blue-800">
          Crie o login em Authentication → Users no painel do Supabase. Depois
          disso, o usuário aparecerá automaticamente nesta página.
        </p>
      </div>

      {errorMessage && (
        <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">
          {successMessage}
        </div>
      )}

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[360px_1fr]">
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h3 className="text-xl font-bold text-slate-900">
            {editingUser ? "Editar usuário" : "Selecione um usuário"}
          </h3>

          {!editingUser && (
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Clique em editar ao lado de um familiar para alterar seu nome ou
              nível de acesso.
            </p>
          )}

          {editingUser && (
            <div className="mt-6 space-y-5">
              <div>
                <label
                  htmlFor="user-name"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Nome
                </label>

                <input
                  id="user-name"
                  type="text"
                  value={form.name}
                  onChange={(event) =>
                    setForm((currentForm) => ({
                      ...currentForm,
                      name: event.target.value,
                    }))
                  }
                  maxLength={80}
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="user-username"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Usuário de acesso
                </label>

                <input
                  id="user-username"
                  type="text"
                  value={editingUser.username}
                  disabled
                  className="w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-4 py-3 text-slate-500"
                />

                <p className="mt-2 text-xs text-slate-500">
                  O usuário não pode ser alterado nesta tela porque está
                  vinculado ao login.
                </p>
              </div>

              <div>
                <label
                  htmlFor="user-role"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Nível de acesso
                </label>

                <select
                  id="user-role"
                  value={form.role}
                  disabled={editingUser.id === currentProfile?.id}
                  onChange={(event) =>
                    setForm((currentForm) => ({
                      ...currentForm,
                      role: event.target.value as "admin" | "common",
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                >
                  <option value="common">Usuário comum</option>

                  <option value="admin">Administrador</option>
                </select>

                {editingUser.id === currentProfile?.id && (
                  <p className="mt-2 text-xs text-slate-500">
                    Você não pode alterar seu próprio nível de acesso.
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={cancelEditing}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-3 font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {submitting ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>
          )}
        </form>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 p-6">
            <div>
              <h3 className="text-xl font-bold text-slate-900">
                Familiares cadastrados
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                {users.length}{" "}
                {users.length === 1
                  ? "usuário encontrado"
                  : "usuários encontrados"}
              </p>
            </div>

            <button
              type="button"
              onClick={loadUsers}
              disabled={loading}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
            >
              Atualizar
            </button>
          </div>

          {loading && (
            <div className="p-10 text-center text-slate-500">
              Carregando usuários...
            </div>
          )}

          {!loading && users.length === 0 && (
            <div className="p-10 text-center text-slate-500">
              Nenhum usuário encontrado.
            </div>
          )}

          {!loading && users.length > 0 && (
            <div className="divide-y divide-slate-200">
              {users.map((user) => {
                const isCurrentUser = user.id === currentProfile?.id;

                return (
                  <article key={user.id} className="p-5 sm:p-6">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-lg font-bold text-slate-900">
                            {user.name}
                          </h4>

                          {isCurrentUser && (
                            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                              Você
                            </span>
                          )}

                          <span
                            className={
                              user.active
                                ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                                : "rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500"
                            }
                          >
                            {user.active ? "Ativo" : "Inativo"}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
                          <span>Usuário: {user.username}</span>

                          <span>
                            {user.role === "admin"
                              ? "Administrador"
                              : "Usuário comum"}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => startEditing(user)}
                          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                        >
                          Editar
                        </button>

                        <button
                          type="button"
                          disabled={isCurrentUser || changingUserId === user.id}
                          onClick={() => toggleUserStatus(user)}
                          className={
                            user.active
                              ? "rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                              : "rounded-lg border border-emerald-200 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
                          }
                        >
                          {changingUserId === user.id
                            ? "Alterando..."
                            : user.active
                              ? "Desativar"
                              : "Ativar"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
