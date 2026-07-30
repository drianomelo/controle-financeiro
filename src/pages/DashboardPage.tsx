import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { formatCurrencyFromCents } from "../utils/currency";

type InvoiceStatus = "open" | "paid";

type DashboardUser = {
  id: string;
  name: string;
};

type DashboardProfile = {
  id: string;
  name: string;
  salary_cents: number;
  active: boolean;
};

type DashboardInvoiceItem = {
  id: string;
  amount_cents: number;

  user: DashboardUser | null;
};

type DashboardInvoice = {
  id: string;
  invoice_month: string;
  status: InvoiceStatus;
  items: DashboardInvoiceItem[];
};

type MonthlySummary = {
  monthIndex: number;
  salaryTotal: number;
  total: number;
  paidTotal: number;
  openTotal: number;
  remaining: number;
  invoiceCount: number;
  itemCount: number;
};

type DashboardPageProps = {
  forcedUserId?: string;
  showBackToUsers?: boolean;
};

const monthNames = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const PROJECTION_START_YEAR = 2026;
const PROJECTION_START_MONTH_INDEX = 6;

function getMonthValue(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
}

function isMonthIncludedInProjection(year: number, monthIndex: number) {
  if (year > PROJECTION_START_YEAR) {
    return true;
  }

  if (year < PROJECTION_START_YEAR) {
    return false;
  }

  return monthIndex >= PROJECTION_START_MONTH_INDEX;
}

function getBalanceTextClass(value: number) {
  return value >= 0 ? "text-emerald-700" : "text-red-600";
}

export function DashboardPage({
  forcedUserId = "",
  showBackToUsers = false,
}: DashboardPageProps) {
  const { profile } = useAuth();

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonthIndex = today.getMonth();

  const [selectedYear, setSelectedYear] = useState(currentYear);

  const [selectedUserId, setSelectedUserId] = useState(forcedUserId);

  useEffect(() => {
    setSelectedUserId(forcedUserId);
  }, [forcedUserId]);

  const [invoices, setInvoices] = useState<DashboardInvoice[]>([]);

  const [profiles, setProfiles] = useState<DashboardProfile[]>([]);

  const [loading, setLoading] = useState(true);

  const [errorMessage, setErrorMessage] = useState("");

  const [warningMessage, setWarningMessage] = useState("");

  const loadDashboard = useCallback(async () => {
    if (!profile) {
      return;
    }

    setLoading(true);
    setErrorMessage("");
    setWarningMessage("");

    /*
     * Quando o administrador visualiza um ano,
     * garantimos que as contas fixas tenham itens
     * gerados até dezembro desse ano.
     */
    if (profile.role === "admin") {
      const { error: generationError } = await supabase.rpc(
        "ensure_fixed_charge_items",
        {
          p_until_month: `${selectedYear}-12-01`,
        },
      );

      if (generationError) {
        console.error("Erro ao atualizar contas fixas:", generationError);

        setWarningMessage(
          "As faturas foram carregadas, mas não foi possível verificar todas as contas fixas.",
        );
      }
    }

    const firstMonth = `${selectedYear}-01-01`;

    const nextYearFirstMonth = `${selectedYear + 1}-01-01`;

    const [invoicesResult, profilesResult] = await Promise.all([
      supabase
        .from("invoices")
        .select(
          `
        id,
        invoice_month,
        status,

        items:invoice_items!invoice_items_invoice_id_fkey (
          id,
          amount_cents,

          user:profiles!invoice_items_user_id_fkey (
            id,
            name
          )
        )
      `,
        )
        .gte("invoice_month", firstMonth)
        .lt("invoice_month", nextYearFirstMonth)
        .order("invoice_month", {
          ascending: true,
        }),

      supabase
        .from("profiles")
        .select(
          `
        id,
        name,
        salary_cents,
        active
      `,
        )
        .eq("active", true)
        .order("name", {
          ascending: true,
        }),
    ]);

    if (invoicesResult.error || profilesResult.error) {
      console.error("Erro ao carregar o dashboard:", {
        invoicesError: invoicesResult.error,
        profilesError: profilesResult.error,
      });

      setErrorMessage("Não foi possível carregar os valores do ano.");

      setInvoices([]);
      setProfiles([]);
      setLoading(false);
      return;
    }

    const loadedInvoices = (invoicesResult.data ??
      []) as unknown as DashboardInvoice[];

    setInvoices(
      loadedInvoices.map((invoice) => ({
        ...invoice,
        items: invoice.items ?? [],
      })),
    );

    setProfiles((profilesResult.data ?? []) as DashboardProfile[]);

    setLoading(false);
  }, [profile, selectedYear]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const userOptions = useMemo(
    () =>
      profiles.map((userProfile) => ({
        id: userProfile.id,
        name: userProfile.name,
      })),
    [profiles],
  );

  const selectedUserProfile = useMemo(
    () =>
      profiles.find((userProfile) => userProfile.id === selectedUserId) ?? null,
    [profiles, selectedUserId],
  );

  const monthlySalary = useMemo(() => {
    if (selectedUserId) {
      const selectedProfile = profiles.find(
        (userProfile) => userProfile.id === selectedUserId,
      );

      return selectedProfile?.salary_cents ?? 0;
    }

    return profiles.reduce(
      (total, userProfile) => total + userProfile.salary_cents,
      0,
    );
  }, [profiles, selectedUserId]);

  const monthlySummaries = useMemo<MonthlySummary[]>(() => {
    return monthNames.map((_monthName, monthIndex) => {
      const monthValue = getMonthValue(selectedYear, monthIndex);

      let total = 0;
      let paidTotal = 0;
      let openTotal = 0;
      let invoiceCount = 0;
      let itemCount = 0;

      invoices.forEach((invoice) => {
        if (invoice.invoice_month !== monthValue) {
          return;
        }

        const visibleItems = selectedUserId
          ? invoice.items.filter((item) => item.user?.id === selectedUserId)
          : invoice.items;

        if (visibleItems.length === 0) {
          return;
        }

        const invoiceTotal = visibleItems.reduce(
          (sum, item) => sum + item.amount_cents,
          0,
        );

        total += invoiceTotal;
        invoiceCount += 1;
        itemCount += visibleItems.length;

        if (invoice.status === "paid") {
          paidTotal += invoiceTotal;
        } else {
          openTotal += invoiceTotal;
        }
      });

      return {
        monthIndex,
        salaryTotal: monthlySalary,
        total,
        paidTotal,
        openTotal,
        remaining: monthlySalary - total,
        invoiceCount,
        itemCount,
      };
    });
  }, [invoices, monthlySalary, selectedUserId, selectedYear]);

  const projectionMonthlySummaries = useMemo(
    () =>
      monthlySummaries.filter((month) =>
        isMonthIncludedInProjection(selectedYear, month.monthIndex),
      ),
    [monthlySummaries, selectedYear],
  );

  const yearTotals = useMemo(() => {
    return projectionMonthlySummaries.reduce(
      (totals, month) => ({
        salaryTotal: totals.salaryTotal + month.salaryTotal,

        total: totals.total + month.total,

        paidTotal: totals.paidTotal + month.paidTotal,

        openTotal: totals.openTotal + month.openTotal,

        remaining: totals.remaining + month.remaining,

        itemCount: totals.itemCount + month.itemCount,
      }),
      {
        salaryTotal: 0,
        total: 0,
        paidTotal: 0,
        openTotal: 0,
        remaining: 0,
        itemCount: 0,
      },
    );
  }, [projectionMonthlySummaries]);

  function goToPreviousYear() {
    setSelectedYear((currentYearValue) => currentYearValue - 1);
  }

  function goToNextYear() {
    setSelectedYear((currentYearValue) => currentYearValue + 1);
  }

  function goToCurrentYear() {
    setSelectedYear(currentYear);
  }

  const projectionPeriodLabel =
    selectedYear < PROJECTION_START_YEAR
      ? "Período anterior ao início das projeções"
      : selectedYear === PROJECTION_START_YEAR
        ? `Julho a dezembro de ${selectedYear}`
        : `Janeiro a dezembro de ${selectedYear}`;

  return (
    <section>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          {showBackToUsers && (
            <Link
              to="/"
              className="mb-5 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              ← Voltar para os familiares
            </Link>
          )}

          <p className="text-sm font-medium text-blue-600">Visão anual</p>

          <h2 className="mt-1 text-3xl font-bold text-slate-900">
            {selectedUserProfile
              ? `${selectedUserProfile.name} — ${selectedYear}`
              : `Faturas de ${selectedYear}`}
          </h2>

          <p className="mt-2 text-slate-600">
            {selectedUserProfile
              ? "Acompanhe as contas, salário e saldo projetado deste familiar."
              : "Acompanhe suas contas e compras ao longo do ano."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={goToPreviousYear}
            disabled={loading}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            ← {selectedYear - 1}
          </button>

          {selectedYear !== currentYear && (
            <button
              type="button"
              onClick={goToCurrentYear}
              disabled={loading}
              className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100 disabled:opacity-50"
            >
              Ano atual
            </button>
          )}

          <button
            type="button"
            onClick={goToNextYear}
            disabled={loading}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {selectedYear + 1} →
          </button>

          <button
            type="button"
            onClick={loadDashboard}
            disabled={loading}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {warningMessage && (
        <div className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
          {warningMessage}
        </div>
      )}

      {profile?.role === "admin" && !forcedUserId && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <label
            htmlFor="dashboard-user-filter"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Visualizar familiar
          </label>

          <select
            id="dashboard-user-filter"
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
            disabled={loading}
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100 sm:max-w-sm"
          >
            <option value="">Todos os familiares</option>

            {userOptions.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Salário mensal</p>

          <p className="mt-2 text-2xl font-bold text-blue-700">
            {formatCurrencyFromCents(monthlySalary)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Receitas projetadas no ano</p>

          <p className="mt-2 text-2xl font-bold text-slate-900">
            {formatCurrencyFromCents(yearTotals.salaryTotal)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Contas do ano</p>

          <p className="mt-2 text-2xl font-bold text-amber-700">
            {formatCurrencyFromCents(yearTotals.total)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Saldo projetado do ano</p>

          <p
            className={`mt-2 text-2xl font-bold ${getBalanceTextClass(
              yearTotals.remaining,
            )}`}
          >
            {formatCurrencyFromCents(yearTotals.remaining)}
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-500">
        Período considerado nos totais:{" "}
        <strong className="font-semibold text-slate-700">
          {projectionPeriodLabel}
        </strong>
      </p>

      <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
        O valor disponível é uma projeção calculada usando o salário mensal
        atual menos as contas cadastradas em cada mês. Outras despesas não
        registradas no sistema não entram no cálculo.
      </div>

      {loading && (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
          Carregando valores do ano...
        </div>
      )}

      {!loading && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {monthlySummaries.map((summary) => {
            const monthName = monthNames[summary.monthIndex];

            const isCurrentMonth =
              selectedYear === currentYear &&
              summary.monthIndex === currentMonthIndex;

            const hasCharges = summary.itemCount > 0;

            const isHistoricalMonth = !isMonthIncludedInProjection(
              selectedYear,
              summary.monthIndex,
            );

            const isPastMonth =
              selectedYear < currentYear ||
              (selectedYear === currentYear &&
                summary.monthIndex < currentMonthIndex);

            const balanceLabel = isPastMonth
              ? "Saldo calculado"
              : "Disponível projetado";

            const monthRoute = forcedUserId
              ? `/usuarios/${forcedUserId}/faturas/${selectedYear}/${summary.monthIndex + 1}`
              : `/faturas/${selectedYear}/${summary.monthIndex + 1}`;

            return (
              <Link
                key={monthName}
                to={monthRoute}
                className={
                  isHistoricalMonth
                    ? "group rounded-2xl border border-slate-200 bg-slate-50 p-6 opacity-75 saturate-50 shadow-sm transition hover:-translate-y-1 hover:border-slate-300 hover:opacity-100 hover:saturate-100 hover:shadow-md"
                    : "group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-md"
                }
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-slate-500">
                      Mês {summary.monthIndex + 1}
                    </p>

                    <h3 className="mt-1 text-xl font-bold text-slate-900">
                      {monthName}
                    </h3>
                  </div>

                  {isHistoricalMonth ? (
                    <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-600">
                      Histórico
                    </span>
                  ) : (
                    isCurrentMonth && (
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                        Atual
                      </span>
                    )
                  )}
                </div>

                {isHistoricalMonth ? (
                  <>
                    <div className="mt-7">
                      <p className="text-sm text-slate-500">Salário do mês</p>

                      <p className="mt-1 text-2xl font-bold text-slate-700">
                        {formatCurrencyFromCents(summary.salaryTotal)}
                      </p>
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-4">
                      <span className="text-sm font-medium text-slate-500">
                        Ver histórico
                      </span>

                      <span className="text-xl text-slate-500 transition group-hover:translate-x-1">
                        →
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mt-7">
                      <p className="text-sm text-slate-500">{balanceLabel}</p>

                      <p
                        className={`mt-1 text-2xl font-bold ${getBalanceTextClass(
                          summary.remaining,
                        )}`}
                      >
                        {formatCurrencyFromCents(summary.remaining)}
                      </p>
                    </div>

                    <div className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Salário</span>

                        <span className="font-medium text-blue-700">
                          {formatCurrencyFromCents(summary.salaryTotal)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Contas</span>

                        <span className="font-medium text-slate-800">
                          {formatCurrencyFromCents(summary.total)}
                        </span>
                      </div>

                      {hasCharges && (
                        <>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-slate-500">Pago</span>

                            <span className="font-medium text-emerald-700">
                              {formatCurrencyFromCents(summary.paidTotal)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-3">
                            <span className="text-slate-500">Em aberto</span>

                            <span className="font-medium text-amber-700">
                              {formatCurrencyFromCents(summary.openTotal)}
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="mt-5 flex items-center justify-between">
                      <span className="text-sm text-slate-500">
                        {hasCharges
                          ? `${summary.itemCount} ${
                              summary.itemCount === 1
                                ? "lançamento"
                                : "lançamentos"
                            }`
                          : "Ver mês"}
                      </span>

                      <span className="text-xl text-blue-600 transition group-hover:translate-x-1">
                        →
                      </span>
                    </div>
                  </>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
