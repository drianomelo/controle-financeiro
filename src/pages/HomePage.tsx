import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CreditCard,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";

import { UserAvatar } from "../components/UserAvatar";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { formatCurrencyFromCents } from "../utils/currency";
import { DashboardPage } from "./DashboardPage";

type FinancialStatus = "all" | "negative" | "non_negative";

type HomeUser = {
  id: string;
  name: string;
  username: string;
  avatar_path: string | null;
};

type HomeCard = {
  id: string;
  name: string;
  active: boolean;
};

type HomeIncomeSource = {
  id: string;
  user_id: string;
  recurrence: "monthly" | "once";
  amount_cents: number;
  start_month: string;
  end_month: string | null;
  active: boolean;
};

type HomeInvoiceItem = {
  user_id: string;
  amount_cents: number;
};

type HomeInvoice = {
  id: string;
  card_id: string;
  items: HomeInvoiceItem[];
};

type UserFinancialSummary = HomeUser & {
  incomeTotal: number;
  expenseTotal: number;
  balance: number;
  usedCardIds: string[];
  usedCards: HomeCard[];
};

const currentDate = new Date();

const currentMonthValue = `${currentDate.getFullYear()}-${String(
  currentDate.getMonth() + 1,
).padStart(2, "0")}-01`;

const currentMonthLabel = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
}).format(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));

function incomeAppliesToMonth(income: HomeIncomeSource, monthValue: string) {
  if (!income.active) {
    return false;
  }

  if (income.recurrence === "once") {
    return income.start_month === monthValue;
  }

  const alreadyStarted = income.start_month <= monthValue;

  const hasNotEnded = !income.end_month || income.end_month >= monthValue;

  return alreadyStarted && hasNotEnded;
}

function getStatusButtonClass(selected: boolean) {
  return selected
    ? "flex-1 flex flex-col cursor-pointer w-full items-center gap-3 rounded-md border border-indigo-300 bg-indigo-50 px-4 pb-4 pt-5 text-sm font-semibold text-indigo-500 transition"
    : "flex-1 flex flex-col cursor-pointer w-full items-center gap-3 rounded-md border border-slate-200 bg-slate-100 px-4 pb-4 pt-5 text-sm font-medium text-slate-400 transition hover:border-indigo-200 hover:bg-indigo-50";
}

function normalizeCardName(cardName: string) {
  return cardName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getCardColorClass(cardName: string) {
  const normalizedName = normalizeCardName(cardName);

  if (normalizedName.includes("nubank")) {
    return "text-purple-400";
  }

  if (normalizedName.includes("banese")) {
    return "text-emerald-600/70";
  }

  if (normalizedName.includes("assai")) {
    return "text-orange-400/80";
  }

  if (normalizedName.includes("hiper")) {
    return "text-red-400";
  }

  if (
    normalizedName.includes("magalu") ||
    normalizedName.includes("magazine luiza")
  ) {
    return "text-blue-400";
  }

  return "text-slate-400";
}

export function HomePage() {
  const { profile } = useAuth();

  const [users, setUsers] = useState<HomeUser[]>([]);
  const [cards, setCards] = useState<HomeCard[]>([]);
  const [incomeSources, setIncomeSources] = useState<HomeIncomeSource[]>([]);
  const [invoices, setInvoices] = useState<HomeInvoice[]>([]);

  const [statusFilter, setStatusFilter] = useState<FinancialStatus>("all");

  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);

  const [errorMessage, setErrorMessage] = useState("");

  const [isActiveFiltersOpen, setIsActiveFiltersOpen] = useState(false);

  const loadHomeData = useCallback(async () => {
    if (profile?.role !== "admin") {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage("");

    const [usersResult, cardsResult, incomesResult, invoicesResult] =
      await Promise.all([
        supabase
          .from("profiles")
          .select(
            `
          id,
          name,
          username,
          avatar_path
        `,
          )
          .eq("active", true)
          .order("name", {
            ascending: true,
          }),

        supabase
          .from("cards")
          .select(
            `
          id,
          name,
          active
        `,
          )
          .eq("kind", "credit_card")
          .order("name", {
            ascending: true,
          }),

        supabase
          .from("income_sources")
          .select(
            `
          id,
          user_id,
          recurrence,
          amount_cents,
          start_month,
          end_month,
          active
        `,
          )
          .eq("active", true),

        supabase
          .from("invoices")
          .select(
            `
          id,
          card_id,

          items:invoice_items!invoice_items_invoice_id_fkey (
            user_id,
            amount_cents
          )
        `,
          )
          .eq("invoice_month", currentMonthValue),
      ]);

    if (
      usersResult.error ||
      cardsResult.error ||
      incomesResult.error ||
      invoicesResult.error
    ) {
      console.error("Erro ao carregar página inicial:", {
        usersError: usersResult.error,
        cardsError: cardsResult.error,
        incomesError: incomesResult.error,
        invoicesError: invoicesResult.error,
      });

      setErrorMessage("Não foi possível carregar os familiares e filtros.");

      setUsers([]);
      setCards([]);
      setIncomeSources([]);
      setInvoices([]);

      setLoading(false);
      return;
    }

    setUsers((usersResult.data ?? []) as HomeUser[]);

    setCards((cardsResult.data ?? []) as HomeCard[]);

    setIncomeSources((incomesResult.data ?? []) as HomeIncomeSource[]);

    const loadedInvoices = (invoicesResult.data ??
      []) as unknown as HomeInvoice[];

    setInvoices(
      loadedInvoices.map((invoice) => ({
        ...invoice,
        items: invoice.items ?? [],
      })),
    );

    setLoading(false);
  }, [profile?.role]);

  useEffect(() => {
    loadHomeData();
  }, [loadHomeData]);

  const userSummaries = useMemo<UserFinancialSummary[]>(() => {
    const creditCardIds = new Set(cards.map((card) => card.id));

    return users.map((user) => {
      const incomeTotal = incomeSources.reduce((total, income) => {
        if (
          income.user_id !== user.id ||
          !incomeAppliesToMonth(income, currentMonthValue)
        ) {
          return total;
        }

        return total + income.amount_cents;
      }, 0);

      let expenseTotal = 0;

      const usedCardIds = new Set<string>();

      invoices.forEach((invoice) => {
        const userItems = invoice.items.filter(
          (item) => item.user_id === user.id,
        );

        if (userItems.length === 0) {
          return;
        }

        expenseTotal += userItems.reduce(
          (total, item) => total + item.amount_cents,
          0,
        );

        /*
         * Fontes "Fora do cartão" também
         * entram nas despesas, mas não
         * aparecem no filtro de cartões.
         */
        if (creditCardIds.has(invoice.card_id)) {
          usedCardIds.add(invoice.card_id);
        }
      });

      const usedCards = cards.filter((card) => usedCardIds.has(card.id));

      return {
        ...user,
        incomeTotal,
        expenseTotal,
        balance: incomeTotal - expenseTotal,
        usedCardIds: Array.from(usedCardIds),
        usedCards,
      };
    });
  }, [cards, incomeSources, invoices, users]);

  const availableCards = useMemo(
    () =>
      cards.filter((card) =>
        userSummaries.some((user) => user.usedCardIds.includes(card.id)),
      ),
    [cards, userSummaries],
  );

  const selectedCards = useMemo(
    () => cards.filter((card) => selectedCardIds.includes(card.id)),
    [cards, selectedCardIds],
  );

  const filteredUsers = useMemo(() => {
    return userSummaries.filter((user) => {
      if (statusFilter === "negative" && user.balance >= 0) {
        return false;
      }

      if (statusFilter === "non_negative" && user.balance < 0) {
        return false;
      }

      if (selectedCardIds.length > 0) {
        const usedAnySelectedCard = selectedCardIds.some((cardId) =>
          user.usedCardIds.includes(cardId),
        );

        if (!usedAnySelectedCard) {
          return false;
        }
      }

      return true;
    });
  }, [selectedCardIds, statusFilter, userSummaries]);

  const activeFilterCount =
    (statusFilter === "all" ? 0 : 1) + selectedCardIds.length;

  const hasActiveFilters = activeFilterCount > 0;

  function clearFilters() {
    setStatusFilter("all");
    setSelectedCardIds([]);
    setIsActiveFiltersOpen(false);
  }

  function toggleCardFilter(cardId: string) {
    setSelectedCardIds((currentCardIds) =>
      currentCardIds.includes(cardId)
        ? currentCardIds.filter((currentCardId) => currentCardId !== cardId)
        : [...currentCardIds, cardId],
    );
  }

  if (profile?.role !== "admin") {
    return <DashboardPage />;
  }

  return (
    <section className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
      <aside className="w-full lg:sticky lg:top-6 lg:w-87.5 lg:shrink-0">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <SlidersHorizontal size={17} />
            Filtros
          </span>

          <button
            type="button"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
            className="flex cursor-pointer items-center gap-1.5 text-sm font-medium text-red-500 transition hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Trash2 size={14} className="-mt-0.5" />
            Limpar tudo
          </button>
        </div>

        <div className="mb-4 overflow-hidden rounded-xl border border-indigo-200">
          <button
            type="button"
            onClick={() =>
              setIsActiveFiltersOpen((currentValue) => !currentValue)
            }
            aria-expanded={isActiveFiltersOpen}
            className="flex w-full cursor-pointer items-center justify-between bg-indigo-50 pl-5 pr-3 pt-4 pb-3.5 text-left transition hover:bg-indigo-100"
          >
            <span className="text-sm font-semibold text-indigo-950">
              Seleção atual
            </span>

            <div className="flex items-center gap-1">
              <span className="text-sm font-semibold text-indigo-500">
                {activeFilterCount === 0
                  ? "Nenhum filtro"
                  : `${activeFilterCount} ${
                      activeFilterCount === 1
                        ? "filtro ativo"
                        : "filtros ativos"
                    }`}
              </span>

              <ChevronDown
                size={13}
                className={`text-indigo-500 transition-transform duration-200 ${
                  isActiveFiltersOpen ? "rotate-180" : ""
                }`}
              />
            </div>
          </button>

          {isActiveFiltersOpen && (
            <div className="flex flex-wrap items-center justify-center gap-2 border-t bg-slate-50 border-indigo-100 p-4 pb-3.5">
              {!hasActiveFilters && (
                <p className="text-sm text-slate-400">
                  Todos os familiares estão sendo exibidos.
                </p>
              )}

              {statusFilter !== "all" && (
                <span className="flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1.5 text-xs font-semibold text-indigo-700">
                  {statusFilter === "negative"
                    ? "Negativados"
                    : "Não negativados"}

                  <button
                    type="button"
                    onClick={() => setStatusFilter("all")}
                    aria-label="Remover filtro de situação"
                    className="cursor-pointer rounded-full p-0.5 transition hover:bg-indigo-200"
                  >
                    <X size={12} />
                  </button>
                </span>
              )}

              {selectedCards.map((card) => (
                <span
                  key={card.id}
                  className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600"
                >
                  {card.name}

                  <button
                    type="button"
                    onClick={() => toggleCardFilter(card.id)}
                    aria-label={`Remover filtro ${card.name}`}
                    className="cursor-pointer rounded-full p-0.5 transition hover:bg-slate-200"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="bg-slate-100 px-6 pb-3 pt-3.5 text-center flex justify-between">
            <p className="font-semibold text-slate-600">Melo Finance</p>

            <p className="mt-1 text-sm capitalize text-slate-400">
              {currentMonthLabel}
            </p>
          </div>

          <div className="border-t border-slate-200 p-6">
            <p className="mb-3 text-[15px] font-semibold text-slate-600">
              Situação financeira
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-pressed={statusFilter === "negative"}
                onClick={() =>
                  setStatusFilter(
                    statusFilter === "negative" ? "all" : "negative",
                  )
                }
                className={getStatusButtonClass(statusFilter === "negative")}
              >
                <CircleAlert size={26} />

                <span className="flex-1">Negativados</span>
              </button>

              <button
                type="button"
                aria-pressed={statusFilter === "non_negative"}
                onClick={() =>
                  setStatusFilter(
                    statusFilter === "non_negative" ? "all" : "non_negative",
                  )
                }
                className={getStatusButtonClass(
                  statusFilter === "non_negative",
                )}
              >
                <CircleCheck size={26} />

                <span className="flex-1">Não negativados</span>
              </button>
            </div>
          </div>

          <div className="border-t border-slate-200 p-6">
            <p className="mb-3 text-[15px] font-semibold text-slate-600">
              Cartões usados
            </p>

            {availableCards.length === 0 && (
              <p className="text-sm leading-6 text-slate-400">
                Nenhum cartão foi utilizado neste mês.
              </p>
            )}

            {availableCards.length > 0 && (
              <div className="space-y-2">
                {availableCards.map((card) => {
                  const checked = selectedCardIds.includes(card.id);

                  return (
                    <label
                      key={card.id}
                      className={
                        checked
                          ? "flex cursor-pointer items-center justify-between gap-3 rounded-md border border-indigo-300 bg-indigo-50 px-4 pb-3 pt-3.5"
                          : "flex cursor-pointer items-center justify-between gap-3 rounded-md bg-slate-100 border border-slate-200 px-4 pb-3 pt-3.5 transition hover:border-indigo-200 hover:bg-indigo-50"
                      }
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-2 h-2 rounded-full border ring ${checked ? "bg-indigo-400 ring-indigo-400 border-indigo-100" : "bg-slate-300 ring-slate-300 border-slate-100"}`}
                        />

                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCardFilter(card.id)}
                          className="hidden"
                        />

                        <span
                          className={`min-w-0 flex-1 truncate text-sm ${checked ? "text-indigo-500 font-semibold" : "text-slate-400 font-medium"}`}
                        >
                          {card.name}
                        </span>
                      </div>

                      <CreditCard
                        size={20}
                        className={getCardColorClass(card.name)}
                      />
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">Familiares</h2>

            <p className="mt-2 text-slate-600">
              Selecione um familiar para visualizar suas faturas e projeções
              financeiras.
            </p>

            {!loading && (
              <p className="mt-2 text-sm text-slate-400">
                Exibindo{" "}
                <strong className="font-semibold text-slate-600">
                  {filteredUsers.length}
                </strong>{" "}
                de{" "}
                <strong className="font-semibold text-slate-600">
                  {userSummaries.length}
                </strong>{" "}
                familiares.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={loadHomeData}
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

        {!loading && userSummaries.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <h3 className="font-semibold text-slate-900">
              Nenhum familiar ativo
            </h3>

            <p className="mt-2 text-sm text-slate-500">
              Cadastre ou ative um usuário para começar.
            </p>
          </div>
        )}

        {!loading && userSummaries.length > 0 && filteredUsers.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <h3 className="font-semibold text-slate-900">
              Nenhum familiar corresponde aos filtros
            </h3>

            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 cursor-pointer text-sm font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Limpar filtros
            </button>
          </div>
        )}

        {!loading && filteredUsers.length > 0 && (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filteredUsers.map((user) => {
              const isNegative = user.balance < 0;

              return (
                <Link
                  key={user.id}
                  to={`/usuarios/${user.id}/faturas`}
                  className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-indigo-300 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-4">
                    <UserAvatar
                      name={user.name}
                      avatarPath={user.avatar_path}
                      size={72}
                      className="ring-4 ring-slate-100"
                    />

                    <span
                      className={
                        isNegative
                          ? "rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600"
                          : "rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600"
                      }
                    >
                      {isNegative ? "Negativado" : "Em dia"}
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
                    <p className="text-xs font-medium capitalize text-slate-400">
                      Saldo de {currentMonthLabel}
                    </p>

                    <p
                      className={
                        isNegative
                          ? "mt-1 text-2xl font-bold text-red-600"
                          : "mt-1 text-2xl font-bold text-emerald-600"
                      }
                    >
                      {formatCurrencyFromCents(user.balance)}
                    </p>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-slate-400">Receitas</p>

                        <p className="mt-1 font-semibold text-slate-700">
                          {formatCurrencyFromCents(user.incomeTotal)}
                        </p>
                      </div>

                      <div>
                        <p className="text-slate-400">Contas</p>

                        <p className="mt-1 font-semibold text-slate-700">
                          {formatCurrencyFromCents(user.expenseTotal)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {user.usedCards.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {user.usedCards.map((card) => (
                        <span
                          key={card.id}
                          className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500"
                        >
                          {card.name}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-5 flex items-center justify-between">
                    <span className="text-sm font-semibold text-indigo-600">
                      Ver faturas por mês
                    </span>

                    <ChevronRight
                      size={18}
                      className="text-indigo-500 transition-transform group-hover:translate-x-1"
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
