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
  moneyInputToCents,
} from "../utils/currency";
import { UserAvatar } from "../components/UserAvatar";

type ChargeType = "variable" | "fixed" | "installment";

type UserOption = {
  id: string;
  name: string;
  username: string;
  active: boolean;
  avatar_path: string | null;
};

type CardOption = {
  id: string;
  name: string;
  last_four: string | null;
  kind: "credit_card" | "direct";
  owner_user_id: string | null;
};

type ChargeRelationUser = {
  id: string;
  name: string;
  username: string;
};

type ChargeRelationCard = {
  id: string;
  name: string;
  last_four: string | null;
};

type Charge = {
  id: string;
  name: string;
  type: ChargeType;
  amount_cents: number;
  installment_count: number | null;
  first_invoice_month: string;
  end_invoice_month: string | null;
  active: boolean;
  created_at: string;
  user: ChargeRelationUser | null;
  card: ChargeRelationCard | null;
};

type ChargeForm = {
  name: string;
  cardId: string;
  type: ChargeType;
  amount: string;
  firstInvoiceMonth: string;
  installmentCount: string;
  endInvoiceMonth: string;
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

const PAGE_SIZE = 10;


function getCurrentMonthValue() {
  const currentDate = new Date();

  const year = currentDate.getFullYear();

  const month = String(currentDate.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function getEmptyForm(): ChargeForm {
  return {
    name: "",
    cardId: "",
    type: "variable",
    amount: "",
    firstInvoiceMonth: getCurrentMonthValue(),
    installmentCount: "",
    endInvoiceMonth: "",
  };
}

function formatInvoiceMonth(value: string) {
  const [year, month] = value.slice(0, 7).split("-");

  const monthNumber = Number(month);

  if (!year || monthNumber < 1 || monthNumber > 12) {
    return value;
  }

  return `${monthNames[monthNumber - 1]} de ${year}`;
}

function getTypeLabel(type: ChargeType) {
  if (type === "fixed") {
    return "Fixa";
  }

  if (type === "installment") {
    return "Parcelada";
  }

  return "Variável";
}

function getTypeBadgeClass(type: ChargeType) {
  if (type === "fixed") {
    return "bg-violet-50 text-violet-700";
  }

  if (type === "installment") {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-blue-50 text-blue-700";
}

export function ChargesPage() {
  const [form, setForm] = useState<ChargeForm>(getEmptyForm);

  const [users, setUsers] = useState<UserOption[]>([]);
  const [cards, setCards] = useState<CardOption[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);

  const [loadingReferences, setLoadingReferences] = useState(true);

  const [loadingCharges, setLoadingCharges] = useState(true);

  const [submitting, setSubmitting] = useState(false);

  const [editingCharge, setEditingCharge] = useState<Charge | null>(null);

  const [removingChargeId, setRemovingChargeId] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState("");

  const [successMessage, setSuccessMessage] = useState("");

  const [selectedUserId, setSelectedUserId] =
    useState("");

  const [searchTerm, setSearchTerm] =
    useState("");

  const [typeFilter, setTypeFilter] =
    useState("");

  const [sourceFilter, setSourceFilter] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState<"all" | "active" | "inactive">("all");

  const [currentPage, setCurrentPage] =
    useState(1);

  const [totalCharges, setTotalCharges] =
    useState(0);


  const loadReferences = useCallback(async () => {
    setLoadingReferences(true);

    const [usersResult, cardsResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, name, username, active, avatar_path")
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
            last_four,
            kind,
            owner_user_id
        `,
        )
        .eq("active", true)
        .order("name", {
          ascending: true,
        }),
    ]);

    if (usersResult.error) {
      console.error("Erro ao carregar usuários:", usersResult.error);

      setErrorMessage("Não foi possível carregar os usuários.");
    } else {
      setUsers((usersResult.data ?? []) as UserOption[]);
    }

    if (cardsResult.error) {
      console.error("Erro ao carregar cartões:", cardsResult.error);

      setErrorMessage("Não foi possível carregar os cartões.");
    } else {
      setCards((cardsResult.data ?? []) as CardOption[]);
    }

    setLoadingReferences(false);
  }, []);

  const loadCharges = useCallback(async () => {
    if (!selectedUserId) {
      setCharges([]);
      setTotalCharges(0);
      setLoadingCharges(false);
      return;
    }

    setLoadingCharges(true);
    setErrorMessage("");

    const from =
      (currentPage - 1) * PAGE_SIZE;

    const to =
      from + PAGE_SIZE - 1;

    let query = supabase
      .from("charges")
      .select(
        `
        id,
        name,
        type,
        amount_cents,
        installment_count,
        first_invoice_month,
        end_invoice_month,
        active,
        created_at,

        user:profiles!charges_user_id_fkey (
          id,
          name,
          username
        ),

        card:cards!charges_card_id_fkey (
          id,
          name,
          last_four
        )
      `,
        {
          count: "exact",
        },
      )
      .eq(
        "user_id",
        selectedUserId,
      );

    /*
     * Busca pelo nome da conta.
     */
    if (searchTerm.trim()) {
      query = query.ilike(
        "name",
        `%${searchTerm.trim()}%`,
      );
    }

    /*
     * Filtro por tipo.
     */
    if (typeFilter) {
      query = query.eq(
        "type",
        typeFilter,
      );
    }

    /*
     * Filtro por cartão/origem.
     */
    if (sourceFilter) {
      query = query.eq(
        "card_id",
        sourceFilter,
      );
    }

    /*
     * Filtro por status.
     */
    if (statusFilter === "active") {
      query = query.eq(
        "active",
        true,
      );
    }

    if (statusFilter === "inactive") {
      query = query.eq(
        "active",
        false,
      );
    }

    const {
      data,
      error,
      count,
    } = await query
      .order("created_at", {
        ascending: false,
      })
      .range(
        from,
        to,
      );

    if (error) {
      console.error(
        "Erro ao carregar contas:",
        error,
      );

      setErrorMessage(
        "Não foi possível carregar as contas.",
      );

      setCharges([]);
      setTotalCharges(0);
      setLoadingCharges(false);
      return;
    }

    setCharges(
      (data ?? []) as unknown as Charge[],
    );

    setTotalCharges(
      count ?? 0,
    );

    setLoadingCharges(false);
  }, [
    currentPage,
    searchTerm,
    selectedUserId,
    sourceFilter,
    statusFilter,
    typeFilter,
  ]);

  useEffect(() => {
    loadReferences();
  }, [loadReferences]);

  useEffect(() => {
    loadCharges();
  }, [loadCharges]);

  const amountCents = useMemo(
    () => moneyInputToCents(form.amount),
    [form.amount],
  );

  const creditCards = useMemo(
    () => cards.filter((card) => card.kind === "credit_card"),
    [cards],
  );

  const selectedUserDirectSource = useMemo(
    () =>
      cards.find(
        (card) =>
          card.kind === "direct" &&
          card.owner_user_id === selectedUserId,
      ) ?? null,
    [cards, selectedUserId],
  );

  const availableSources = useMemo(() => {
    if (!selectedUserId) {
      return [];
    }

    return cards.filter((card) => {
      if (card.kind === "credit_card") {
        return true;
      }

      return (
        card.kind === "direct" &&
        card.owner_user_id === selectedUserId
      );
    });
  }, [cards, selectedUserId]);

  const installmentPreview = useMemo(() => {
    if (form.type !== "installment" || !amountCents) {
      return null;
    }

    const installmentCount = Number(form.installmentCount);

    if (!Number.isInteger(installmentCount) || installmentCount < 2) {
      return null;
    }

    const baseAmount = Math.floor(amountCents / installmentCount);

    const remainder = amountCents % installmentCount;

    return {
      baseAmount,
      remainder,
      installmentCount,
    };
  }, [amountCents, form.installmentCount, form.type]);

  function updateForm(field: keyof ChargeForm, value: string) {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }



  function handleTypeChange(type: ChargeType) {
    setForm((currentForm) => ({
      ...currentForm,
      type,
      installmentCount: "",
      endInvoiceMonth: "",
    }));

    setErrorMessage("");
    setSuccessMessage("");
  }

  function resetForm() {
    setForm(getEmptyForm());
    setEditingCharge(null);
  }

  function startEditing(charge: Charge) {
    setErrorMessage("");
    setSuccessMessage("");

    setEditingCharge(charge);

    setForm({
      name: charge.name,
      cardId: charge.card?.id ?? "",
      type: charge.type,
      amount: formatMoneyInput(String(charge.amount_cents)),
      firstInvoiceMonth: charge.first_invoice_month.slice(0, 7),
      installmentCount: charge.installment_count
        ? String(charge.installment_count)
        : "",
      endInvoiceMonth: charge.end_invoice_month
        ? charge.end_invoice_month.slice(0, 7)
        : "",
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function cancelEditing() {
    setErrorMessage("");
    setSuccessMessage("");
    resetForm();
  }

  function validateForm() {
    if (!form.name.trim()) {
      return "Informe o nome da conta.";
    }

    if (!selectedUserId) {
      return "Selecione um familiar.";
    }

    if (!form.cardId) {
      return "Selecione o cartão.";
    }

    if (!amountCents) {
      return "Informe um valor válido.";
    }

    if (!form.firstInvoiceMonth) {
      return "Informe a primeira fatura.";
    }

    if (form.type === "installment") {
      const installmentCount = Number(form.installmentCount);

      if (!Number.isInteger(installmentCount) || installmentCount < 2) {
        return "Informe pelo menos duas parcelas.";
      }

      if (installmentCount > 120) {
        return "A quantidade máxima é de 120 parcelas.";
      }

      if (amountCents < installmentCount) {
        return (
          "O valor total não pode ser menor " + "que a quantidade de parcelas."
        );
      }
    }

    if (
      form.type === "fixed" &&
      form.endInvoiceMonth &&
      form.endInvoiceMonth < form.firstInvoiceMonth
    ) {
      return "O mês final não pode ser anterior " + "ao mês inicial.";
    }

    return null;
  }

  function selectUser(userId: string) {
    if (userId === selectedUserId) {
      return;
    }

    setSelectedUserId(userId);

    setForm(getEmptyForm());
    setEditingCharge(null);

    setSearchTerm("");
    setTypeFilter("");
    setSourceFilter("");
    setStatusFilter("all");

    setCurrentPage(1);

    setErrorMessage("");
    setSuccessMessage("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");

    const validationError = validateForm();

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    if (!amountCents) {
      return;
    }

    setSubmitting(true);

    const installmentCount =
      form.type === "installment" ? Number(form.installmentCount) : null;

    const endInvoiceMonth =
      form.type === "fixed" && form.endInvoiceMonth
        ? `${form.endInvoiceMonth}-01`
        : null;

    const functionName = editingCharge
      ? "update_charge_with_items"
      : "create_charge_with_items";

    const functionArguments = {
      ...(editingCharge
        ? {
          p_charge_id: editingCharge.id,
        }
        : {}),
      p_name: form.name.trim(),
      p_user_id: selectedUserId,
      p_card_id: form.cardId,
      p_type: form.type,
      p_amount_cents: amountCents,
      p_first_invoice_month: `${form.firstInvoiceMonth}-01`,
      p_installment_count: installmentCount,
      p_end_invoice_month: endInvoiceMonth,
    };

    const { error } = await supabase.rpc(functionName, functionArguments);

    if (error) {
      console.error("Erro ao cadastrar conta:", error);

      setErrorMessage(
        error.message ||
        (editingCharge
          ? "Não foi possível editar a conta."
          : "Não foi possível cadastrar a conta."),
      );

      setSubmitting(false);
      return;
    }

    const wasEditing = Boolean(editingCharge);

    resetForm();

    setSuccessMessage(
      wasEditing
        ? "Conta atualizada e cobranças recriadas com sucesso."
        : "Conta cadastrada e faturas geradas com sucesso.",
    );

    if (!wasEditing && currentPage !== 1) {
      setCurrentPage(1);
    } else {
      await loadCharges();
    }

    setSubmitting(false);
  }

  async function removeCharge(charge: Charge) {
    setErrorMessage("");
    setSuccessMessage("");

    const confirmed = window.confirm(
      `Deseja remover a conta "${charge.name}"?\n\n` +
      "As cobranças em faturas abertas serão removidas. " +
      "O histórico de faturas pagas será preservado.",
    );

    if (!confirmed) {
      return;
    }

    setRemovingChargeId(charge.id);

    const { error } = await supabase.rpc("remove_charge", {
      p_charge_id: charge.id,
    });

    if (error) {
      console.error("Erro ao remover conta:", error);

      setErrorMessage(error.message || "Não foi possível remover a conta.");

      setRemovingChargeId(null);
      return;
    }

    if (editingCharge?.id === charge.id) {
      resetForm();
    }

    setSuccessMessage(
      "Conta removida e cobranças abertas excluídas.",
    );

    if (
      charges.length === 1 &&
      currentPage > 1
    ) {
      setCurrentPage(
        (page) => page - 1,
      );
    } else {
      await loadCharges();
    }

    setRemovingChargeId(null);
  }

  const selectedUser = useMemo(
    () =>
      users.find(
        (user) =>
          user.id === selectedUserId,
      ) ?? null,
    [users, selectedUserId],
  );

  const totalPages = Math.max(
    1,
    Math.ceil(
      totalCharges / PAGE_SIZE,
    ),
  );

  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    Boolean(typeFilter) ||
    Boolean(sourceFilter) ||
    statusFilter !== "all";

  const firstVisibleItem =
    totalCharges === 0
      ? 0
      : (currentPage - 1) *
      PAGE_SIZE +
      1;

  const lastVisibleItem = Math.min(
    currentPage * PAGE_SIZE,
    totalCharges,
  );

  function clearChargeFilters() {
    setSearchTerm("");
    setTypeFilter("");
    setSourceFilter("");
    setStatusFilter("all");
    setCurrentPage(1);
  }



  return (
    <section>
      <div>
        <p className="text-sm font-medium text-blue-600">Administração</p>

        <h2 className="mt-1 text-3xl font-bold text-slate-900">Contas</h2>

        <p className="mt-2 text-slate-600">
          Escolha um familiar para gerenciar suas contas.
        </p>
      </div>

      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {users.map((user) => {
          const selected =
            selectedUserId === user.id;

          return (
            <div
              key={user.id}
              onClick={() => selectUser(user.id)}
              className={`cursor-pointer rounded-lg border px-4 py-3 transition-colors ${selected
                ? "border-blue-500 bg-blue-100 text-blue-700"
                : "border-slate-300 hover:bg-slate-100"
                }`}
            >
              <p className="font-medium">{user.name}</p>
            </div>
          );
        })}
      </div>

      {!selectedUserId && !loadingReferences && (
        <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
          <h3 className="font-bold text-slate-800">
            Selecione um familiar
          </h3>

          <p className="mt-2 text-sm text-slate-500">
            Escolha um dos familiares acima para visualizar
            e cadastrar suas contas.
          </p>
        </div>
      )}

      {selectedUserId && (
        <div className="mt-8 grid items-start gap-6 xl:grid-cols-[420px_1fr]">
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  {editingCharge ? "Editar conta" : "Nova conta"}
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  {editingCharge
                    ? "As cobranças abertas serão atualizadas automaticamente."
                    : "O sistema criará as cobranças nas faturas automaticamente."}
                </p>
              </div>

              {editingCharge && (
                <button
                  type="button"
                  onClick={cancelEditing}
                  className="text-sm font-medium text-slate-500 transition hover:text-slate-900"
                >
                  Cancelar
                </button>
              )}
            </div>

            {selectedUser && (
              <div className="mt-5 flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                <UserAvatar
                  name={selectedUser.name}
                  avatarPath={
                    selectedUser.avatar_path
                  }
                  size={42}
                />

                <div>
                  <p className="text-xs font-medium text-indigo-500">
                    {editingCharge
                      ? "Editando conta de"
                      : "Cadastrando conta para"}
                  </p>

                  <p className="font-bold text-indigo-950">
                    {selectedUser.name}
                  </p>
                </div>
              </div>
            )}

            <div className="mt-6 space-y-5">
              <div>
                <label
                  htmlFor="charge-name"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Nome
                </label>

                <input
                  id="charge-name"
                  type="text"
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  placeholder="Ex.: Mercado, Netflix ou celular"
                  maxLength={120}
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="charge-card"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Forma de cobrança
                </label>

                <select
                  id="charge-card"
                  value={form.cardId}
                  disabled={loadingReferences || !selectedUserId}
                  onChange={(event) => updateForm("cardId", event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                >
                  <option value="">
                    {selectedUserId
                      ? "Selecione uma forma de cobrança"
                      : "Selecione primeiro um usuário"}
                  </option>

                  {creditCards.length > 0 && (
                    <optgroup label="Cartões de crédito">
                      {creditCards.map((card) => (
                        <option key={card.id} value={card.id}>
                          {card.name}
                          {card.last_four ? ` — final ${card.last_four}` : ""}
                        </option>
                      ))}
                    </optgroup>
                  )}

                  {selectedUserDirectSource && (
                    <optgroup label="Outras contas">
                      <option value={selectedUserDirectSource.id}>
                        Fora do cartão
                      </option>
                    </optgroup>
                  )}
                </select>

                {selectedUserId && (
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Use “Fora do cartão” para aluguel, faculdade, conta de
                    telefone e outras cobranças diretas.
                  </p>
                )}
              </div>

              <fieldset>
                <legend className="mb-2 block text-sm font-medium text-slate-700">
                  Tipo
                </legend>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleTypeChange("variable")}
                    className={
                      form.type === "variable"
                        ? "rounded-lg bg-blue-600 px-3 py-3 text-sm font-medium text-white"
                        : "rounded-lg border border-slate-300 px-3 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
                    }
                  >
                    Variável
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTypeChange("fixed")}
                    className={
                      form.type === "fixed"
                        ? "rounded-lg bg-blue-600 px-3 py-3 text-sm font-medium text-white"
                        : "rounded-lg border border-slate-300 px-3 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
                    }
                  >
                    Fixa
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTypeChange("installment")}
                    className={
                      form.type === "installment"
                        ? "rounded-lg bg-blue-600 px-3 py-3 text-sm font-medium text-white"
                        : "rounded-lg border border-slate-300 px-3 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
                    }
                  >
                    Parcelada
                  </button>
                </div>
              </fieldset>

              <div>
                <label
                  htmlFor="charge-amount"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  {form.type === "installment"
                    ? "Valor total da compra"
                    : form.type === "fixed"
                      ? "Valor mensal"
                      : "Valor da cobrança"}
                </label>

                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                    R$
                  </span>

                  <input
                    id="charge-amount"
                    type="text"
                    inputMode="numeric"
                    value={form.amount}
                    onChange={(event) =>
                      updateForm("amount", formatMoneyInput(event.target.value))
                    }
                    placeholder="0,00"
                    className="w-full rounded-lg border border-slate-300 py-3 pl-12 pr-4 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </div>
              </div>

              {form.type === "installment" && (
                <div>
                  <label
                    htmlFor="installment-count"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Quantidade de parcelas
                  </label>

                  <input
                    id="installment-count"
                    type="number"
                    min={2}
                    max={120}
                    value={form.installmentCount}
                    onChange={(event) =>
                      updateForm("installmentCount", event.target.value)
                    }
                    placeholder="Ex.: 6"
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />

                  {installmentPreview && (
                    <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                      Aproximadamente{" "}
                      <strong>
                        {installmentPreview.installmentCount}x de{" "}
                        {formatCurrencyFromCents(installmentPreview.baseAmount)}
                      </strong>
                      .
                      {installmentPreview.remainder > 0 && (
                        <span>
                          {" "}
                          As primeiras {installmentPreview.remainder} parcelas
                          terão um centavo a mais.
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label
                  htmlFor="first-invoice-month"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  {form.type === "installment"
                    ? "Primeira parcela"
                    : "Primeira fatura"}
                </label>

                <input
                  id="first-invoice-month"
                  type="month"
                  value={form.firstInvoiceMonth}
                  onChange={(event) =>
                    updateForm("firstInvoiceMonth", event.target.value)
                  }
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              {form.type === "fixed" && (
                <div>
                  <label
                    htmlFor="end-invoice-month"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Última fatura
                  </label>

                  <input
                    id="end-invoice-month"
                    type="month"
                    min={form.firstInvoiceMonth}
                    value={form.endInvoiceMonth}
                    onChange={(event) =>
                      updateForm("endInvoiceMonth", event.target.value)
                    }
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />

                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Deixe vazio quando a cobrança não possuir data definida para
                    terminar.
                  </p>
                </div>
              )}

              {errorMessage && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  {errorMessage}
                </div>
              )}

              {successMessage && (
                <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
                  {successMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={
                  submitting ||
                  loadingReferences ||
                  users.length === 0 ||
                  cards.length === 0
                }
                className="w-full rounded-lg bg-blue-600 px-5 py-3 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting
                  ? editingCharge
                    ? "Salvando alterações..."
                    : "Gerando faturas..."
                  : editingCharge
                    ? "Salvar alterações"
                    : "Cadastrar conta"}
              </button>

              {!loadingReferences &&
                (users.length === 0 || cards.length === 0) && (
                  <p className="text-center text-sm text-red-600">
                    É necessário possuir pelo menos um usuário e um cartão ativos.
                  </p>
                )}
            </div>
          </form>

          <div className="min-w-0">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-slate-900">
                    Filtros
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    Encontre uma conta específica.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={clearChargeFilters}
                  disabled={!hasActiveFilters}
                  className="text-sm font-semibold text-indigo-600 transition hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Limpar filtros
                </button>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="charge-search"
                    className="mb-2 block text-sm font-medium text-slate-600"
                  >
                    Buscar conta
                  </label>

                  <input
                    id="charge-search"
                    type="text"
                    value={searchTerm}
                    onChange={(event) => {
                      setSearchTerm(
                        event.target.value,
                      );

                      setCurrentPage(1);
                    }}
                    placeholder="Ex.: Netflix ou faculdade"
                    className="w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor="charge-type-filter"
                    className="mb-2 block text-sm font-medium text-slate-600"
                  >
                    Tipo
                  </label>

                  <select
                    id="charge-type-filter"
                    value={typeFilter}
                    onChange={(event) => {
                      setTypeFilter(
                        event.target.value,
                      );

                      setCurrentPage(1);
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                  >
                    <option value="">
                      Todos os tipos
                    </option>

                    <option value="variable">
                      Variável
                    </option>

                    <option value="fixed">
                      Fixa
                    </option>

                    <option value="installment">
                      Parcelada
                    </option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="charge-source-filter"
                    className="mb-2 block text-sm font-medium text-slate-600"
                  >
                    Cartão / origem
                  </label>

                  <select
                    id="charge-source-filter"
                    value={sourceFilter}
                    onChange={(event) => {
                      setSourceFilter(
                        event.target.value,
                      );

                      setCurrentPage(1);
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                  >
                    <option value="">
                      Todos
                    </option>

                    {availableSources.map(
                      (source) => (
                        <option
                          key={source.id}
                          value={source.id}
                        >
                          {source.kind === "direct"
                            ? "Fora do cartão"
                            : source.name}
                        </option>
                      ),
                    )}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="charge-status-filter"
                    className="mb-2 block text-sm font-medium text-slate-600"
                  >
                    Status
                  </label>

                  <select
                    id="charge-status-filter"
                    value={statusFilter}
                    onChange={(event) => {
                      setStatusFilter(
                        event.target.value as
                        | "all"
                        | "active"
                        | "inactive",
                      );

                      setCurrentPage(1);
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                  >
                    <option value="all">
                      Todas
                    </option>

                    <option value="active">
                      Ativas
                    </option>

                    <option value="inactive">
                      Inativas
                    </option>
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-4 border-b border-slate-200 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">
                    Contas cadastradas
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    {totalCharges}{" "}
                    {totalCharges === 1
                      ? "conta encontrada"
                      : "contas encontradas"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={loadCharges}
                  disabled={loadingCharges}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                >
                  Atualizar
                </button>
              </div>

              {loadingCharges && (
                <div className="p-10 text-center text-slate-500">
                  Carregando contas...
                </div>
              )}

              {!loadingCharges && charges.length === 0 && (
                <div className="p-10 text-center">
                  <h4 className="font-semibold text-slate-900">
                    {hasActiveFilters
                      ? "Nenhuma conta encontrada"
                      : "Nenhuma conta cadastrada"}
                  </h4>

                  <p className="mt-2 text-sm text-slate-500">
                    {hasActiveFilters
                      ? "Nenhuma conta corresponde aos filtros selecionados."
                      : "Utilize o formulário para cadastrar o primeiro lançamento."}
                  </p>

                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={clearChargeFilters}
                      className="mt-4 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
                    >
                      Limpar filtros
                    </button>
                  )}
                </div>
              )}

              {!loadingCharges && charges.length > 0 && (
                <div className="divide-y divide-slate-200">
                  {charges.map((charge) => (
                    <article key={charge.id} className="p-5 sm:p-6">
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-lg font-bold text-slate-900">
                              {charge.name}
                            </h4>

                            <span
                              className={`rounded-full px-3 py-1 text-xs font-medium ${getTypeBadgeClass(
                                charge.type,
                              )}`}
                            >
                              {getTypeLabel(charge.type)}
                            </span>

                            {!charge.active && (
                              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
                                Inativa
                              </span>
                            )}
                          </div>

                          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
                            <span>
                              {charge.user?.name ?? "Usuário não encontrado"}
                            </span>

                            <span>
                              {charge.card?.name ?? "Cartão não encontrado"}

                              {charge.card?.last_four
                                ? ` — final ${charge.card.last_four}`
                                : ""}
                            </span>
                          </div>

                          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
                            <span>
                              Início:{" "}
                              {formatInvoiceMonth(charge.first_invoice_month)}
                            </span>

                            {charge.type === "installment" &&
                              charge.installment_count && (
                                <span>{charge.installment_count} parcelas</span>
                              )}

                            {charge.type === "fixed" &&
                              charge.end_invoice_month && (
                                <span>
                                  Término:{" "}
                                  {formatInvoiceMonth(charge.end_invoice_month)}
                                </span>
                              )}

                            {charge.type === "fixed" &&
                              !charge.end_invoice_month && (
                                <span>Sem término definido</span>
                              )}
                          </div>
                        </div>

                        <div className="flex flex-col gap-4 lg:items-end">
                          <div className="lg:text-right">
                            <p className="text-sm text-slate-500">
                              {charge.type === "installment"
                                ? "Valor total"
                                : charge.type === "fixed"
                                  ? "Valor mensal"
                                  : "Valor"}
                            </p>

                            <p className="mt-1 text-xl font-bold text-slate-900">
                              {formatCurrencyFromCents(charge.amount_cents)}
                            </p>
                          </div>

                          {charge.active && (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => startEditing(charge)}
                                disabled={removingChargeId === charge.id}
                                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                              >
                                Editar
                              </button>

                              <button
                                type="button"
                                onClick={() => removeCharge(charge)}
                                disabled={removingChargeId === charge.id}
                                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {removingChargeId === charge.id
                                  ? "Removendo..."
                                  : "Remover"}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {!loadingCharges && totalCharges > 0 && (
                <div className="flex flex-col gap-4 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-500">
                    Exibindo{" "}
                    <strong className="font-semibold text-slate-700">
                      {firstVisibleItem}
                    </strong>
                    {" – "}
                    <strong className="font-semibold text-slate-700">
                      {lastVisibleItem}
                    </strong>{" "}
                    de{" "}
                    <strong className="font-semibold text-slate-700">
                      {totalCharges}
                    </strong>
                  </p>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={currentPage === 1}
                      onClick={() =>
                        setCurrentPage(
                          (page) =>
                            Math.max(
                              1,
                              page - 1,
                            ),
                        )
                      }
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Anterior
                    </button>

                    <span className="px-2 text-sm text-slate-500">
                      Página{" "}
                      <strong className="text-slate-800">
                        {currentPage}
                      </strong>{" "}
                      de{" "}
                      <strong className="text-slate-800">
                        {totalPages}
                      </strong>
                    </span>

                    <button
                      type="button"
                      disabled={
                        currentPage >= totalPages
                      }
                      onClick={() =>
                        setCurrentPage(
                          (page) =>
                            Math.min(
                              totalPages,
                              page + 1,
                            ),
                        )
                      }
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Próxima
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
