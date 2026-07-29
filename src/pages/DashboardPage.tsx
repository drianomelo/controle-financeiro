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
  total: number;
  paidTotal: number;
  openTotal: number;
  invoiceCount: number;
  itemCount: number;
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

function getMonthValue(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
}

export function DashboardPage() {
  const { profile } = useAuth();

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonthIndex = today.getMonth();

  const [selectedYear, setSelectedYear] = useState(currentYear);

  const [selectedUserId, setSelectedUserId] = useState("");

  const [invoices, setInvoices] = useState<DashboardInvoice[]>([]);

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

    const { data, error } = await supabase
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
      });

    if (error) {
      console.error("Erro ao carregar o dashboard:", error);

      setErrorMessage("Não foi possível carregar os valores do ano.");

      setInvoices([]);
      setLoading(false);
      return;
    }

    const loadedInvoices = (data ?? []) as unknown as DashboardInvoice[];

    setInvoices(
      loadedInvoices.map((invoice) => ({
        ...invoice,
        items: invoice.items ?? [],
      })),
    );

    setLoading(false);
  }, [profile, selectedYear]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const userOptions = useMemo(() => {
    const usersMap = new Map<string, DashboardUser>();

    invoices.forEach((invoice) => {
      invoice.items.forEach((item) => {
        if (item.user) {
          usersMap.set(item.user.id, item.user);
        }
      });
    });

    return Array.from(usersMap.values()).sort((firstUser, secondUser) =>
      firstUser.name.localeCompare(secondUser.name, "pt-BR"),
    );
  }, [invoices]);

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
        total,
        paidTotal,
        openTotal,
        invoiceCount,
        itemCount,
      };
    });
  }, [invoices, selectedUserId, selectedYear]);

  const yearTotals = useMemo(() => {
    return monthlySummaries.reduce(
      (totals, month) => ({
        total: totals.total + month.total,
        paidTotal: totals.paidTotal + month.paidTotal,
        openTotal: totals.openTotal + month.openTotal,
        itemCount: totals.itemCount + month.itemCount,
      }),
      {
        total: 0,
        paidTotal: 0,
        openTotal: 0,
        itemCount: 0,
      },
    );
  }, [monthlySummaries]);

  function goToPreviousYear() {
    setSelectedYear((currentYearValue) => currentYearValue - 1);
  }

  function goToNextYear() {
    setSelectedYear((currentYearValue) => currentYearValue + 1);
  }

  function goToCurrentYear() {
    setSelectedYear(currentYear);
  }

  return (
    <section>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-600">Visão anual</p>

          <h2 className="mt-1 text-3xl font-bold text-slate-900">
            Faturas de {selectedYear}
          </h2>

          <p className="mt-2 text-slate-600">
            {profile?.role === "admin"
              ? "Acompanhe as contas de todos os familiares."
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

      {profile?.role === "admin" && (
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
          <p className="text-sm text-slate-500">Total do ano</p>

          <p className="mt-2 text-2xl font-bold text-slate-900">
            {formatCurrencyFromCents(yearTotals.total)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total pago</p>

          <p className="mt-2 text-2xl font-bold text-emerald-700">
            {formatCurrencyFromCents(yearTotals.paidTotal)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Em aberto ou futuro</p>

          <p className="mt-2 text-2xl font-bold text-amber-700">
            {formatCurrencyFromCents(yearTotals.openTotal)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Lançamentos</p>

          <p className="mt-2 text-2xl font-bold text-slate-900">
            {yearTotals.itemCount}
          </p>
        </div>
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

            return (
              <Link
                key={monthName}
                to={`/faturas/${selectedYear}/${summary.monthIndex + 1}`}
                className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-md"
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

                  {isCurrentMonth && (
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                      Atual
                    </span>
                  )}
                </div>

                <div className="mt-7">
                  <p className="text-sm text-slate-500">Total do mês</p>

                  <p
                    className={
                      hasCharges
                        ? "mt-1 text-2xl font-bold text-slate-900"
                        : "mt-1 text-xl font-semibold text-slate-400"
                    }
                  >
                    {hasCharges
                      ? formatCurrencyFromCents(summary.total)
                      : "Sem lançamentos"}
                  </p>
                </div>

                {hasCharges && (
                  <div className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-sm">
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
                  </div>
                )}

                <div className="mt-5 flex items-center justify-between">
                  <span className="text-sm text-slate-500">
                    {hasCharges
                      ? `${summary.itemCount} ${
                          summary.itemCount === 1 ? "lançamento" : "lançamentos"
                        }`
                      : "Ver mês"}
                  </span>

                  <span className="text-xl text-blue-600 transition group-hover:translate-x-1">
                    →
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
