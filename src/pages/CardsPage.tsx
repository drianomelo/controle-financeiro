import { type FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Card = {
  id: string;
  name: string;
  last_four: string | null;
  closing_day: number;
  due_day: number;
  active: boolean;
  created_at: string;
};

type CardForm = {
  name: string;
  lastFour: string;
  closingDay: string;
  dueDay: string;
};

const emptyForm: CardForm = {
  name: "",
  lastFour: "",
  closingDay: "",
  dueDay: "",
};

export function CardsPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [form, setForm] = useState<CardForm>(emptyForm);

  const [editingCard, setEditingCard] = useState<Card | null>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [changingCardId, setChangingCardId] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState("");

  const [successMessage, setSuccessMessage] = useState("");

  const loadCards = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("cards")
      .select(
        `
      id,
      name,
      last_four,
      closing_day,
      due_day,
      active,
      created_at
    `,
      )
      .eq("kind", "credit_card")
      .order("active", {
        ascending: false,
      })
      .order("name", {
        ascending: true,
      });

    if (error) {
      console.error("Erro ao carregar cartões:", error);

      setErrorMessage("Não foi possível carregar os cartões.");

      setLoading(false);
      return;
    }

    setCards((data ?? []) as Card[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  function updateForm(field: keyof CardForm, value: string) {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }

  function handleLastFourChange(value: string) {
    const onlyNumbers = value.replace(/\D/g, "").slice(0, 4);

    updateForm("lastFour", onlyNumbers);
  }

  function clearMessages() {
    setErrorMessage("");
    setSuccessMessage("");
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingCard(null);
  }

  function startEditing(card: Card) {
    clearMessages();

    setEditingCard(card);

    setForm({
      name: card.name,
      lastFour: card.last_four ?? "",
      closingDay: String(card.closing_day),
      dueDay: String(card.due_day),
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

  function validateForm() {
    const normalizedName = form.name.trim();
    const closingDay = Number(form.closingDay);
    const dueDay = Number(form.dueDay);

    if (!normalizedName) {
      return "Informe o nome do cartão.";
    }

    if (form.lastFour && !/^\d{4}$/.test(form.lastFour)) {
      return "O final do cartão deve possuir " + "exatamente quatro números.";
    }

    if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31) {
      return "O dia de fechamento deve estar " + "entre 1 e 31.";
    }

    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
      return "O dia de vencimento deve estar " + "entre 1 e 31.";
    }

    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();

    const validationError = validateForm();

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setSubmitting(true);

    const cardData = {
      name: form.name.trim(),
      last_four: form.lastFour || null,
      closing_day: Number(form.closingDay),
      due_day: Number(form.dueDay),
    };

    if (editingCard) {
      const { error } = await supabase
        .from("cards")
        .update(cardData)
        .eq("id", editingCard.id);

      if (error) {
        console.error("Erro ao editar cartão:", error);

        setErrorMessage("Não foi possível editar o cartão.");

        setSubmitting(false);
        return;
      }

      resetForm();

      setSuccessMessage("Cartão atualizado com sucesso.");

      await loadCards();
      setSubmitting(false);
      return;
    }

    const { error } = await supabase.from("cards").insert(cardData);

    if (error) {
      console.error("Erro ao cadastrar cartão:", error);

      setErrorMessage("Não foi possível cadastrar o cartão.");

      setSubmitting(false);
      return;
    }

    resetForm();

    setSuccessMessage("Cartão cadastrado com sucesso.");

    await loadCards();
    setSubmitting(false);
  }

  async function toggleCardStatus(card: Card) {
    clearMessages();

    const action = card.active ? "desativar" : "ativar";

    const confirmed = window.confirm(
      `Deseja ${action} o cartão "${card.name}"?`,
    );

    if (!confirmed) {
      return;
    }

    setChangingCardId(card.id);

    const { error } = await supabase
      .from("cards")
      .update({
        active: !card.active,
      })
      .eq("id", card.id);

    if (error) {
      console.error("Erro ao alterar cartão:", error);

      setErrorMessage("Não foi possível alterar o status do cartão.");

      setChangingCardId(null);
      return;
    }

    setSuccessMessage(
      card.active
        ? "Cartão desativado com sucesso."
        : "Cartão ativado com sucesso.",
    );

    await loadCards();
    setChangingCardId(null);
  }

  return (
    <section>
      <div>
        <p className="text-sm font-medium text-blue-600">Administração</p>

        <h2 className="mt-1 text-3xl font-bold text-slate-900">Cartões</h2>

        <p className="mt-2 text-slate-600">
          Cadastre os cartões utilizados nas contas da família.
        </p>
      </div>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[380px_1fr]">
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-slate-900">
                {editingCard ? "Editar cartão" : "Novo cartão"}
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                {editingCard
                  ? "Altere as informações do cartão."
                  : "Informe os dados básicos do cartão."}
              </p>
            </div>

            {editingCard && (
              <button
                type="button"
                onClick={cancelEditing}
                className="text-sm font-medium text-slate-500 hover:text-slate-900"
              >
                Cancelar
              </button>
            )}
          </div>

          <div className="mt-6 space-y-5">
            <div>
              <label
                htmlFor="card-name"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Nome do cartão
              </label>

              <input
                id="card-name"
                type="text"
                value={form.name}
                onChange={(event) => updateForm("name", event.target.value)}
                placeholder="Ex.: Nubank"
                maxLength={60}
                className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div>
              <label
                htmlFor="last-four"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Quatro últimos números
              </label>

              <input
                id="last-four"
                type="text"
                inputMode="numeric"
                value={form.lastFour}
                onChange={(event) => handleLastFourChange(event.target.value)}
                placeholder="Ex.: 4582"
                maxLength={4}
                className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />

              <p className="mt-2 text-xs text-slate-500">
                Este campo é opcional. Não informe o número completo do cartão.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="closing-day"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Fechamento
                </label>

                <input
                  id="closing-day"
                  type="number"
                  min={1}
                  max={31}
                  value={form.closingDay}
                  onChange={(event) =>
                    updateForm("closingDay", event.target.value)
                  }
                  placeholder="Ex.: 8"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="due-day"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Vencimento
                </label>

                <input
                  id="due-day"
                  type="number"
                  min={1}
                  max={31}
                  value={form.dueDay}
                  onChange={(event) => updateForm("dueDay", event.target.value)}
                  placeholder="Ex.: 15"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>
            </div>

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
              disabled={submitting}
              className="w-full rounded-lg bg-blue-600 px-5 py-3 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting
                ? "Salvando..."
                : editingCard
                  ? "Salvar alterações"
                  : "Cadastrar cartão"}
            </button>
          </div>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  Cartões cadastrados
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  {cards.length}{" "}
                  {cards.length === 1
                    ? "cartão encontrado"
                    : "cartões encontrados"}
                </p>
              </div>

              <button
                type="button"
                onClick={loadCards}
                disabled={loading}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
              >
                Atualizar
              </button>
            </div>
          </div>

          {loading && (
            <div className="p-10 text-center text-slate-500">
              Carregando cartões...
            </div>
          )}

          {!loading && cards.length === 0 && (
            <div className="p-10 text-center">
              <h4 className="font-semibold text-slate-900">
                Nenhum cartão cadastrado
              </h4>

              <p className="mt-2 text-sm text-slate-500">
                Utilize o formulário ao lado para cadastrar o primeiro cartão.
              </p>
            </div>
          )}

          {!loading && cards.length > 0 && (
            <div className="divide-y divide-slate-200">
              {cards.map((card) => (
                <article key={card.id} className="p-5 sm:p-6">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h4 className="text-lg font-bold text-slate-900">
                          {card.name}
                        </h4>

                        <span
                          className={
                            card.active
                              ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                              : "rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500"
                          }
                        >
                          {card.active ? "Ativo" : "Inativo"}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
                        <span>
                          {card.last_four
                            ? `Final ${card.last_four}`
                            : "Final não informado"}
                        </span>

                        <span>Fecha dia {card.closing_day}</span>

                        <span>Vence dia {card.due_day}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => startEditing(card)}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                      >
                        Editar
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleCardStatus(card)}
                        disabled={changingCardId === card.id}
                        className={
                          card.active
                            ? "rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                            : "rounded-lg border border-emerald-200 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
                        }
                      >
                        {changingCardId === card.id
                          ? "Alterando..."
                          : card.active
                            ? "Desativar"
                            : "Ativar"}
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
