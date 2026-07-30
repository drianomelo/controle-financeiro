import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../lib/supabase";
import {
  formatCurrencyFromCents,
  formatMoneyInput,
  moneyInputToNonNegativeCents,
} from "../utils/currency";

type IncomeCategory =
  | "salary"
  | "vacation"
  | "thirteenth"
  | "side_job"
  | "bonus"
  | "other";

type IncomeRecurrence = "monthly" | "once";

type IncomeUser = {
  id: string;
  name: string;
  active: boolean;
};

type IncomeSource = {
  id: string;
  user_id: string;
  name: string;
  category: IncomeCategory;
  recurrence: IncomeRecurrence;
  amount_cents: number;
  start_month: string;
  end_month: string | null;
  active: boolean;
  created_at: string;
};

type IncomeForm = {
  userId: string;
  name: string;
  category: IncomeCategory;
  recurrence: IncomeRecurrence;
  amount: string;
  startMonth: string;
  endMonth: string;
};

const emptyForm: IncomeForm = {
  userId: "",
  name: "",
  category: "salary",
  recurrence: "monthly",
  amount: "",
  startMonth: "",
  endMonth: "",
};

const categoryLabels: Record<IncomeCategory, string> = {
  salary: "Salário",
  vacation: "Férias",
  thirteenth: "13º salário",
  side_job: "Bico",
  bonus: "Bônus",
  other: "Outra receita",
};

const recurrenceLabels: Record<IncomeRecurrence, string> = {
  monthly: "Mensal",
  once: "Receita única",
};

function formatMonth(monthValue: string) {
  const [year, month] = monthValue.slice(0, 7).split("-").map(Number);

  if (!year || !month) {
    return "Mês inválido";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function monthInputToDate(monthValue: string) {
  return `${monthValue}-01`;
}

function dateToMonthInput(dateValue: string | null) {
  return dateValue?.slice(0, 7) ?? "";
}

function getCategoryBadgeClass(category: IncomeCategory) {
  switch (category) {
    case "salary":
      return "bg-blue-50 text-blue-700";

    case "vacation":
      return "bg-violet-50 text-violet-700";

    case "thirteenth":
      return "bg-emerald-50 text-emerald-700";

    case "side_job":
      return "bg-amber-50 text-amber-700";

    case "bonus":
      return "bg-cyan-50 text-cyan-700";

    default:
      return "bg-slate-100 text-slate-600";
  }
}

export function IncomeSourcesPage() {
  const [users, setUsers] = useState<IncomeUser[]>([]);

  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([]);

  const [editingIncome, setEditingIncome] = useState<IncomeSource | null>(null);

  const [form, setForm] = useState<IncomeForm>(emptyForm);

  const [selectedUserId, setSelectedUserId] = useState("");

  const [loading, setLoading] = useState(true);

  const [submitting, setSubmitting] = useState(false);

  const [changingIncomeId, setChangingIncomeId] = useState<string | null>(null);

  const [deletingIncomeId, setDeletingIncomeId] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState("");

  const [successMessage, setSuccessMessage] = useState("");

  const loadPageData = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    const [usersResult, incomesResult] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          `
            id,
            name,
            active
          `,
        )
        .order("active", {
          ascending: false,
        })
        .order("name", {
          ascending: true,
        }),

      supabase
        .from("income_sources")
        .select(
          `
            id,
            user_id,
            name,
            category,
            recurrence,
            amount_cents,
            start_month,
            end_month,
            active,
            created_at
          `,
        )
        .order("start_month", {
          ascending: false,
        })
        .order("created_at", {
          ascending: false,
        }),
    ]);

    if (usersResult.error || incomesResult.error) {
      console.error("Erro ao carregar receitas:", {
        usersError: usersResult.error,
        incomesError: incomesResult.error,
      });

      setErrorMessage("Não foi possível carregar as receitas.");

      setLoading(false);
      return;
    }

    const loadedUsers = (usersResult.data ?? []) as IncomeUser[];

    setUsers(loadedUsers);

    setIncomeSources((incomesResult.data ?? []) as IncomeSource[]);

    setForm((currentForm) => {
      if (currentForm.userId) {
        return currentForm;
      }

      const firstActiveUser = loadedUsers.find((user) => user.active);

      return {
        ...currentForm,
        userId: firstActiveUser?.id ?? "",
      };
    });

    setLoading(false);
  }, []);

  useEffect(() => {
    loadPageData();
  }, [loadPageData]);

  function clearMessages() {
    setErrorMessage("");
    setSuccessMessage("");
  }

  function resetForm() {
    const firstActiveUser = users.find((user) => user.active);

    setEditingIncome(null);

    setForm({
      ...emptyForm,
      userId: firstActiveUser?.id ?? "",
    });
  }

  function startEditing(income: IncomeSource) {
    clearMessages();

    setEditingIncome(income);

    setForm({
      userId: income.user_id,
      name: income.name,
      category: income.category,
      recurrence: income.recurrence,
      amount: formatMoneyInput(String(income.amount_cents)),
      startMonth: dateToMonthInput(income.start_month),
      endMonth: dateToMonthInput(income.end_month),
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

    const normalizedName = form.name.trim();

    if (!form.userId) {
      setErrorMessage("Selecione o usuário da receita.");

      return;
    }

    if (!normalizedName) {
      setErrorMessage("Informe o nome da receita.");

      return;
    }

    const amountCents = moneyInputToNonNegativeCents(form.amount);

    if (amountCents === null || amountCents <= 0) {
      setErrorMessage("Informe um valor maior que zero.");

      return;
    }

    if (!form.startMonth) {
      setErrorMessage(
        form.recurrence === "once"
          ? "Informe o mês da receita."
          : "Informe o mês inicial.",
      );

      return;
    }

    if (
      form.recurrence === "monthly" &&
      form.endMonth &&
      form.endMonth < form.startMonth
    ) {
      setErrorMessage("O mês final não pode ser anterior ao mês inicial.");

      return;
    }

    setSubmitting(true);

    const incomePayload = {
      user_id: form.userId,
      name: normalizedName,
      category: form.category,
      recurrence: form.recurrence,
      amount_cents: amountCents,
      start_month: monthInputToDate(form.startMonth),
      end_month:
        form.recurrence === "monthly" && form.endMonth
          ? monthInputToDate(form.endMonth)
          : null,
    };

    const result = editingIncome
      ? await supabase
          .from("income_sources")
          .update(incomePayload)
          .eq("id", editingIncome.id)
      : await supabase.from("income_sources").insert({
          ...incomePayload,
          active: true,
        });

    if (result.error) {
      console.error("Erro ao salvar receita:", result.error);

      setErrorMessage(
        result.error.message || "Não foi possível salvar a receita.",
      );

      setSubmitting(false);
      return;
    }

    resetForm();

    setSuccessMessage(
      editingIncome
        ? "Receita atualizada com sucesso."
        : "Receita cadastrada com sucesso.",
    );

    await loadPageData();

    setSubmitting(false);
  }

  async function toggleIncomeStatus(income: IncomeSource) {
    clearMessages();

    const action = income.active ? "desativar" : "ativar";

    const confirmed = window.confirm(
      `Deseja ${action} a receita "${income.name}"?`,
    );

    if (!confirmed) {
      return;
    }

    setChangingIncomeId(income.id);

    const { error } = await supabase
      .from("income_sources")
      .update({
        active: !income.active,
      })
      .eq("id", income.id);

    if (error) {
      console.error("Erro ao alterar receita:", error);

      setErrorMessage("Não foi possível alterar a receita.");

      setChangingIncomeId(null);
      return;
    }

    setSuccessMessage(
      income.active
        ? "Receita desativada com sucesso."
        : "Receita ativada com sucesso.",
    );

    await loadPageData();

    setChangingIncomeId(null);
  }

  async function deleteIncome(income: IncomeSource) {
    clearMessages();

    const confirmed = window.confirm(
      `Deseja excluir definitivamente a receita "${income.name}"?`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingIncomeId(income.id);

    const { error } = await supabase
      .from("income_sources")
      .delete()
      .eq("id", income.id);

    if (error) {
      console.error("Erro ao excluir receita:", error);

      setErrorMessage("Não foi possível excluir a receita.");

      setDeletingIncomeId(null);
      return;
    }

    if (editingIncome?.id === income.id) {
      resetForm();
    }

    setSuccessMessage("Receita excluída com sucesso.");

    await loadPageData();

    setDeletingIncomeId(null);
  }

  const filteredIncomeSources = useMemo(() => {
    if (!selectedUserId) {
      return incomeSources;
    }

    return incomeSources.filter((income) => income.user_id === selectedUserId);
  }, [incomeSources, selectedUserId]);

  function getUserName(userId: string) {
    return users.find((user) => user.id === userId)?.name ?? "Usuário";
  }

  return (
    <section>
      <div>
        <p className="text-sm font-medium text-blue-600">Administração</p>

        <h2 className="mt-1 text-3xl font-bold text-slate-900">Receitas</h2>

        <p className="mt-2 text-slate-600">
          Cadastre salários, aumentos, férias, 13º, bicos e outras entradas.
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <h3 className="font-semibold text-blue-900">Alteração de salário</h3>

        <p className="mt-2 text-sm leading-6 text-blue-800">
          Edite o salário antigo e informe o último mês em que ele será
          recebido. Depois cadastre o novo salário com o mês inicial correto.
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

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[380px_1fr]">
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h3 className="text-xl font-bold text-slate-900">
            {editingIncome ? "Editar receita" : "Nova receita"}
          </h3>

          <div className="mt-6 space-y-5">
            <div>
              <label
                htmlFor="income-user"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Familiar
              </label>

              <select
                id="income-user"
                value={form.userId}
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    userId: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >
                <option value="">Selecione</option>

                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                    {!user.active ? " — Inativo" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="income-name"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Nome da receita
              </label>

              <input
                id="income-name"
                type="text"
                value={form.name}
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    name: event.target.value,
                  }))
                }
                maxLength={100}
                placeholder="Ex.: Salário base"
                className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div>
              <label
                htmlFor="income-category"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Categoria
              </label>

              <select
                id="income-category"
                value={form.category}
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    category: event.target.value as IncomeCategory,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >
                {Object.entries(categoryLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="income-recurrence"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Recorrência
              </label>

              <select
                id="income-recurrence"
                value={form.recurrence}
                onChange={(event) => {
                  const recurrence = event.target.value as IncomeRecurrence;

                  setForm((currentForm) => ({
                    ...currentForm,
                    recurrence,
                    endMonth: recurrence === "once" ? "" : currentForm.endMonth,
                  }));
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >
                <option value="monthly">Mensal</option>

                <option value="once">Receita única</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="income-amount"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Valor
              </label>

              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                  R$
                </span>

                <input
                  id="income-amount"
                  type="text"
                  inputMode="numeric"
                  value={form.amount}
                  onChange={(event) =>
                    setForm((currentForm) => ({
                      ...currentForm,
                      amount: formatMoneyInput(event.target.value),
                    }))
                  }
                  placeholder="0,00"
                  className="w-full rounded-lg border border-slate-300 py-3 pl-12 pr-4 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="income-start-month"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                {form.recurrence === "once" ? "Mês da receita" : "Mês inicial"}
              </label>

              <input
                id="income-start-month"
                type="month"
                value={form.startMonth}
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    startMonth: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            {form.recurrence === "monthly" && (
              <div>
                <label
                  htmlFor="income-end-month"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Mês final
                </label>

                <input
                  id="income-end-month"
                  type="month"
                  value={form.endMonth}
                  min={form.startMonth || undefined}
                  onChange={(event) =>
                    setForm((currentForm) => ({
                      ...currentForm,
                      endMonth: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />

                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Deixe vazio enquanto a receita continuar sem uma data final.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              {editingIncome && (
                <button
                  type="button"
                  onClick={cancelEditing}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-3 font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  Cancelar
                </button>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {submitting
                  ? "Salvando..."
                  : editingIncome
                    ? "Salvar alterações"
                    : "Cadastrar receita"}
              </button>
            </div>
          </div>
        </form>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  Receitas cadastradas
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  {filteredIncomeSources.length}{" "}
                  {filteredIncomeSources.length === 1
                    ? "receita encontrada"
                    : "receitas encontradas"}
                </p>
              </div>

              <div className="w-full sm:w-64">
                <label
                  htmlFor="income-user-filter"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Filtrar familiar
                </label>

                <select
                  id="income-user-filter"
                  value={selectedUserId}
                  onChange={(event) => setSelectedUserId(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                >
                  <option value="">Todos os familiares</option>

                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {loading && (
            <div className="p-10 text-center text-slate-500">
              Carregando receitas...
            </div>
          )}

          {!loading && filteredIncomeSources.length === 0 && (
            <div className="p-10 text-center text-slate-500">
              Nenhuma receita encontrada.
            </div>
          )}

          {!loading && filteredIncomeSources.length > 0 && (
            <div className="divide-y divide-slate-200">
              {filteredIncomeSources.map((income) => (
                <article
                  key={income.id}
                  className={
                    income.active
                      ? "p-5 sm:p-6"
                      : "bg-slate-50 p-5 opacity-65 sm:p-6"
                  }
                >
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-lg font-bold text-slate-900">
                          {income.name}
                        </h4>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${getCategoryBadgeClass(
                            income.category,
                          )}`}
                        >
                          {categoryLabels[income.category]}
                        </span>

                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                          {recurrenceLabels[income.recurrence]}
                        </span>

                        {!income.active && (
                          <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600">
                            Inativa
                          </span>
                        )}
                      </div>

                      <p className="mt-2 text-sm text-slate-600">
                        {getUserName(income.user_id)}
                      </p>

                      <p className="mt-3 text-2xl font-bold text-slate-900">
                        {formatCurrencyFromCents(income.amount_cents)}
                      </p>

                      <p className="mt-2 text-sm text-slate-500">
                        {income.recurrence === "once"
                          ? `Recebimento em ${formatMonth(income.start_month)}`
                          : income.end_month
                            ? `${formatMonth(
                                income.start_month,
                              )} até ${formatMonth(income.end_month)}`
                            : `Desde ${formatMonth(
                                income.start_month,
                              )}, sem data final`}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => startEditing(income)}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                      >
                        Editar
                      </button>

                      <button
                        type="button"
                        disabled={changingIncomeId === income.id}
                        onClick={() => toggleIncomeStatus(income)}
                        className={
                          income.active
                            ? "rounded-lg border border-amber-200 px-4 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-50 disabled:opacity-50"
                            : "rounded-lg border border-emerald-200 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
                        }
                      >
                        {changingIncomeId === income.id
                          ? "Alterando..."
                          : income.active
                            ? "Desativar"
                            : "Ativar"}
                      </button>

                      <button
                        type="button"
                        disabled={deletingIncomeId === income.id}
                        onClick={() => deleteIncome(income)}
                        className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                      >
                        {deletingIncomeId === income.id
                          ? "Excluindo..."
                          : "Excluir"}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
