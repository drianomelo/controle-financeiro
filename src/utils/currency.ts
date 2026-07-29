const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const moneyInputFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrencyFromCents(amountCents: number) {
  return currencyFormatter.format(amountCents / 100);
}

export function formatMoneyInput(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  const amount = Number(digits) / 100;

  return moneyInputFormatter.format(amount);
}

export function moneyInputToCents(value: string): number | null {
  const digits = value.replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  const amountCents = Number(digits);

  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    return null;
  }

  return amountCents;
}
