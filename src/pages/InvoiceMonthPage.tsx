import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { formatCurrencyFromCents } from "../utils/currency";

type InvoiceStatus = "open" | "paid";

type ChargeType = "variable" | "fixed" | "installment";

type InvoiceItem = {
  id: string;
  amount_cents: number;
  installment_number: number | null;
  installment_total: number | null;

  charge: {
    id: string;
    name: string;
    type: ChargeType;
  } | null;

  user: {
    id: string;
    name: string;
    username: string;
  } | null;
};

type InvoiceCard = {
  id: string;
  name: string;
  last_four: string | null;
  due_day: number;
  kind: "credit_card" | "direct";
  owner_user_id: string | null;

  owner: {
    id: string;
    name: string;
  } | null;
};

type Invoice = {
  id: string;
  invoice_month: string;
  status: InvoiceStatus;
  paid_at: string | null;
  created_at: string;
  card: InvoiceCard | null;
  items: InvoiceItem[];
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

function getChargeTypeLabel(type: ChargeType) {
  if (type === "fixed") {
    return "Fixa";
  }

  if (type === "installment") {
    return "Parcelada";
  }

  return "Variável";
}

function getChargeTypeClass(type: ChargeType) {
  if (type === "fixed") {
    return "bg-violet-50 text-violet-700";
  }

  if (type === "installment") {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-blue-50 text-blue-700";
}

function getSourceName(card: InvoiceCard | null) {
  if (!card) {
    return "Forma de cobrança não encontrada";
  }

  if (card.kind === "direct") {
    return card.owner?.name
      ? `Outras contas — ${card.owner.name}`
      : "Outras contas";
  }

  if (card.last_four) {
    return `${card.name} — final ${card.last_four}`;
  }

  return card.name;
}

function getInvoiceVisualStatus(invoice: Invoice) {
  if (invoice.status === "paid") {
    return {
      label: "Paga",
      className: "bg-emerald-50 text-emerald-700",
    };
  }

  const [year, month] = invoice.invoice_month
    .slice(0, 7)
    .split("-")
    .map(Number);

  const today = new Date();

  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  const isFuture =
    year > currentYear || (year === currentYear && month > currentMonth);

  if (isFuture) {
    return {
      label: "Futura",
      className: "bg-blue-50 text-blue-700",
    };
  }

  return {
    label: "Em aberto",
    className: "bg-amber-50 text-amber-700",
  };
}

function getAdjacentMonth(year: number, month: number, difference: number) {
  const date = new Date(year, month - 1 + difference, 1);

  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  };
}

function formatPaidDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function InvoiceMonthPage() {
  const { profile } = useAuth();

  const { year, month } = useParams();

  const yearNumber = Number(year);
  const monthNumber = Number(month);

  const validMonth =
    Number.isInteger(monthNumber) && monthNumber >= 1 && monthNumber <= 12;

  const validYear =
    Number.isInteger(yearNumber) && yearNumber >= 2000 && yearNumber <= 2200;

  const [invoices, setInvoices] = useState<Invoice[]>([]);

  const [loading, setLoading] = useState(true);

  const [changingInvoiceId, setChangingInvoiceId] = useState<string | null>(
    null,
  );

  const [selectedUserId, setSelectedUserId] = useState("");

  const [selectedCardId, setSelectedCardId] = useState("");

  const [errorMessage, setErrorMessage] = useState("");

  const [successMessage, setSuccessMessage] = useState("");

  const monthValue =
    validMonth && validYear
      ? `${yearNumber}-${String(monthNumber).padStart(2, "0")}-01`
      : "";

  const loadInvoices = useCallback(async () => {
    if (!monthValue) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("invoices")
      .select(
        `
        id,
        invoice_month,
        status,
        paid_at,
        created_at,

        card:cards!invoices_card_id_fkey (
          id,
          name,
          last_four,
          due_day,
          kind,
          owner_user_id,

          owner:profiles!cards_owner_user_id_fkey (
            id,
            name
          )
        ),

        items:invoice_items!invoice_items_invoice_id_fkey (
          id,
          amount_cents,
          installment_number,
          installment_total,

          charge:charges!invoice_items_charge_id_fkey (
            id,
            name,
            type
          ),

          user:profiles!invoice_items_user_id_fkey (
            id,
            name,
            username
          )
        )
      `,
      )
      .eq("invoice_month", monthValue)
      .order("created_at", {
        ascending: true,
      });

    if (error) {
      console.error("Erro ao carregar faturas:", error);

      setErrorMessage("Não foi possível carregar as faturas deste mês.");

      setInvoices([]);
      setLoading(false);
      return;
    }

    const loadedInvoices = (data ?? []) as unknown as Invoice[];

    const invoicesWithItems = loadedInvoices
      .filter((invoice) => invoice.items && invoice.items.length > 0)
      .map((invoice) => ({
        ...invoice,
        items: [...invoice.items].sort((firstItem, secondItem) =>
          (firstItem.charge?.name ?? "").localeCompare(
            secondItem.charge?.name ?? "",
            "pt-BR",
          ),
        ),
      }));

    setInvoices(invoicesWithItems);
    setLoading(false);
  }, [monthValue]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const userOptions = useMemo(() => {
    const usersMap = new Map<
      string,
      {
        id: string;
        name: string;
      }
    >();

    invoices.forEach((invoice) => {
      invoice.items.forEach((item) => {
        if (item.user) {
          usersMap.set(item.user.id, {
            id: item.user.id,
            name: item.user.name,
          });
        }
      });
    });

    return Array.from(usersMap.values()).sort((firstUser, secondUser) =>
      firstUser.name.localeCompare(secondUser.name, "pt-BR"),
    );
  }, [invoices]);

  const cardOptions = useMemo(() => {
    const cardsMap = new Map<
      string,
      {
        id: string;
        name: string;
      }
    >();

    invoices.forEach((invoice) => {
      if (invoice.card) {
        cardsMap.set(invoice.card.id, {
          id: invoice.card.id,
          name: getSourceName(invoice.card),
        });
      }
    });

    return Array.from(cardsMap.values()).sort((firstCard, secondCard) =>
      firstCard.name.localeCompare(secondCard.name, "pt-BR"),
    );
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    return invoices
      .filter((invoice) => {
        if (selectedCardId && invoice.card?.id !== selectedCardId) {
          return false;
        }

        if (
          selectedUserId &&
          !invoice.items.some((item) => item.user?.id === selectedUserId)
        ) {
          return false;
        }

        return true;
      })
      .map((invoice) => {
        if (!selectedUserId) {
          return invoice;
        }

        return {
          ...invoice,
          items: invoice.items.filter(
            (item) => item.user?.id === selectedUserId,
          ),
        };
      })
      .filter((invoice) => invoice.items.length > 0);
  }, [invoices, selectedCardId, selectedUserId]);

  const monthTotal = useMemo(() => {
    return filteredInvoices.reduce(
      (invoiceTotal, invoice) =>
        invoiceTotal +
        invoice.items.reduce(
          (itemTotal, item) => itemTotal + item.amount_cents,
          0,
        ),
      0,
    );
  }, [filteredInvoices]);

  const paidTotal = useMemo(() => {
    return filteredInvoices.reduce((invoiceTotal, invoice) => {
      if (invoice.status !== "paid") {
        return invoiceTotal;
      }

      return (
        invoiceTotal +
        invoice.items.reduce(
          (itemTotal, item) => itemTotal + item.amount_cents,
          0,
        )
      );
    }, 0);
  }, [filteredInvoices]);

  const openTotal = monthTotal - paidTotal;

  async function toggleInvoiceStatus(invoice: Invoice) {
    setErrorMessage("");
    setSuccessMessage("");

    const willMarkAsPaid = invoice.status !== "paid";

    const confirmed = window.confirm(
      willMarkAsPaid
        ? `Deseja marcar "${getSourceName(invoice.card)}" como paga?`
        : `Deseja reabrir "${getSourceName(invoice.card)}"?`,
    );

    if (!confirmed) {
      return;
    }

    setChangingInvoiceId(invoice.id);

    const { error } = await supabase
      .from("invoices")
      .update({
        status: willMarkAsPaid ? "paid" : "open",

        paid_at: willMarkAsPaid ? new Date().toISOString() : null,
      })
      .eq("id", invoice.id);

    if (error) {
      console.error("Erro ao alterar fatura:", error);

      setErrorMessage("Não foi possível alterar o status da fatura.");

      setChangingInvoiceId(null);
      return;
    }

    setSuccessMessage(
      willMarkAsPaid
        ? "Fatura marcada como paga."
        : "Fatura reaberta com sucesso.",
    );

    await loadInvoices();

    setChangingInvoiceId(null);
  }

  if (!validMonth || !validYear) {
    return (
      <section className="rounded-2xl bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-bold text-slate-900">Período inválido</h2>

        <Link to="/" className="mt-5 inline-block font-medium text-blue-600">
          Voltar para o início
        </Link>
      </section>
    );
  }

  const monthName = monthNames[monthNumber - 1];

  const previousMonth = getAdjacentMonth(yearNumber, monthNumber, -1);

  const nextMonth = getAdjacentMonth(yearNumber, monthNumber, 1);

  return (
    <section>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            to="/"
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            ← Voltar para os meses
          </Link>

          <p className="mt-5 text-sm font-medium text-blue-600">
            Faturas do mês
          </p>

          <h2 className="mt-1 text-3xl font-bold text-slate-900">
            {monthName} de {yearNumber}
          </h2>

          <p className="mt-2 text-slate-600">
            {profile?.role === "admin"
              ? "Visualize as cobranças de todos os familiares."
              : "Visualize suas compras e contas deste mês."}
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            to={`/faturas/${previousMonth.year}/${previousMonth.month}`}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            ← Mês anterior
          </Link>

          <Link
            to={`/faturas/${nextMonth.year}/${nextMonth.month}`}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Próximo mês →
          </Link>
        </div>
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

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total do mês</p>

          <p className="mt-2 text-2xl font-bold text-slate-900">
            {formatCurrencyFromCents(monthTotal)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total pago</p>

          <p className="mt-2 text-2xl font-bold text-emerald-700">
            {formatCurrencyFromCents(paidTotal)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Em aberto ou futuro</p>

          <p className="mt-2 text-2xl font-bold text-amber-700">
            {formatCurrencyFromCents(openTotal)}
          </p>
        </div>
      </div>

      {profile?.role === "admin" && (
        <div className="mt-6 grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
          <div>
            <label
              htmlFor="invoice-user-filter"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Filtrar por usuário
            </label>

            <select
              id="invoice-user-filter"
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              <option value="">Todos os usuários</option>

              {userOptions.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="invoice-card-filter"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Filtrar por forma de cobrança
            </label>

            <select
              id="invoice-card-filter"
              value={selectedCardId}
              onChange={(event) => setSelectedCardId(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              <option value="">Todas as formas</option>

              {cardOptions.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {loading && (
        <div className="mt-8 rounded-2xl bg-white p-10 text-center text-slate-500 shadow-sm">
          Carregando faturas...
        </div>
      )}

      {!loading && filteredInvoices.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h3 className="text-lg font-semibold text-slate-900">
            Nenhuma cobrança encontrada
          </h3>

          <p className="mt-2 text-slate-500">
            Não existem contas cadastradas para este período ou para os filtros
            selecionados.
          </p>
        </div>
      )}

      {!loading && filteredInvoices.length > 0 && (
        <div className="mt-8 space-y-6">
          {filteredInvoices.map((invoice) => {
            const invoiceTotal = invoice.items.reduce(
              (total, item) => total + item.amount_cents,
              0,
            );

            const visualStatus = getInvoiceVisualStatus(invoice);

            return (
              <article
                key={invoice.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="flex flex-col gap-5 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-xl font-bold text-slate-900">
                        {getSourceName(invoice.card)}
                      </h3>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${visualStatus.className}`}
                      >
                        {visualStatus.label}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
                      {invoice.card?.kind === "credit_card" && (
                        <span>Vencimento dia {invoice.card.due_day}</span>
                      )}

                      <span>
                        {invoice.items.length}{" "}
                        {invoice.items.length === 1
                          ? "lançamento"
                          : "lançamentos"}
                      </span>

                      {invoice.paid_at && (
                        <span>Paga em {formatPaidDate(invoice.paid_at)}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:items-end">
                    <div className="sm:text-right">
                      <p className="text-sm text-slate-500">Total</p>

                      <p className="mt-1 text-2xl font-bold text-slate-900">
                        {formatCurrencyFromCents(invoiceTotal)}
                      </p>
                    </div>

                    {profile?.role === "admin" && (
                      <button
                        type="button"
                        disabled={changingInvoiceId === invoice.id}
                        onClick={() => toggleInvoiceStatus(invoice)}
                        className={
                          invoice.status === "paid"
                            ? "rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                            : "rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                        }
                      >
                        {changingInvoiceId === invoice.id
                          ? "Alterando..."
                          : invoice.status === "paid"
                            ? "Reabrir fatura"
                            : "Marcar como paga"}
                      </button>
                    )}
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {invoice.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-semibold text-slate-900">
                            {item.charge?.name ?? "Conta não encontrada"}
                          </h4>

                          {item.charge && (
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-medium ${getChargeTypeClass(
                                item.charge.type,
                              )}`}
                            >
                              {getChargeTypeLabel(item.charge.type)}
                            </span>
                          )}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                          {profile?.role === "admin" && item.user && (
                            <span>{item.user.name}</span>
                          )}

                          {item.installment_number &&
                            item.installment_total && (
                              <span>
                                Parcela {item.installment_number}/
                                {item.installment_total}
                              </span>
                            )}
                        </div>
                      </div>

                      <p className="text-lg font-bold text-slate-900">
                        {formatCurrencyFromCents(item.amount_cents)}
                      </p>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
