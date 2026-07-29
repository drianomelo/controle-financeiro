import { Link } from "react-router";
import { useAuth } from "../contexts/AuthContext";

const months = [
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

export function DashboardPage() {
  const { profile } = useAuth();

  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  return (
    <section>
      <div>
        <p className="text-sm font-medium text-blue-600">Visão anual</p>

        <h2 className="mt-1 text-3xl font-bold text-slate-900">
          Faturas de {currentYear}
        </h2>

        <p className="mt-2 text-slate-600">
          {profile?.role === "admin"
            ? "Selecione um mês para visualizar todas as faturas."
            : "Selecione um mês para visualizar suas faturas."}
        </p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {months.map((month, index) => {
          const isCurrentMonth = index === currentMonth;

          return (
            <Link
              key={month}
              to={`/faturas/${currentYear}/${index + 1}`}
              className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-500">Mês {index + 1}</p>

                  <h3 className="mt-1 text-xl font-bold text-slate-900">
                    {month}
                  </h3>
                </div>

                {isCurrentMonth && (
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                    Atual
                  </span>
                )}
              </div>

              <div className="mt-8 flex items-center justify-between">
                <span className="text-sm text-slate-500">Ver faturas</span>

                <span className="text-xl text-blue-600 transition group-hover:translate-x-1">
                  →
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
