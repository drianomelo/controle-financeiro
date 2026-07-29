function App() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100">
      <section className="rounded-2xl bg-white p-10 text-center shadow-lg">
        <h1 className="text-3xl font-bold text-slate-900">
          Controle Financeiro
        </h1>

        <p className="mt-3 text-slate-600">
          Projeto configurado com React, TypeScript e Tailwind.
        </p>

        <button
          type="button"
          className="mt-6 rounded-lg bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700"
        >
          Começar
        </button>
      </section>
    </main>
  );
}

export default App;
