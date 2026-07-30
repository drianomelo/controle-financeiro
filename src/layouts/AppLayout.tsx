import { NavLink, Outlet } from "react-router";
import { useAuth } from "../contexts/AuthContext";

function getLinkClass({ isActive }: { isActive: boolean }) {
  const baseClass =
    "whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition";

  if (isActive) {
    return `${baseClass} bg-blue-600 text-white`;
  }

  return `${baseClass} text-slate-600 hover:bg-slate-100 hover:text-slate-900`;
}

export function AppLayout() {
  const { profile, signOut } = useAuth();

  async function handleLogout() {
    try {
      await signOut();
    } catch {
      window.alert("Não foi possível encerrar a sessão.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-slate-100">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <a href="/" className="flex items-center gap-2">
            <img className="max-w-15" src="/images/logo.png" alt="logo" />
          </a>

          <div>
            {/* <nav className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 pb-4 sm:px-6 lg:px-8">
              <NavLink to="/" end className={getLinkClass}>
                Início
              </NavLink>

              {profile?.role === "admin" && (
                <>
                  <NavLink to="/cartoes" className={getLinkClass}>
                    Cartões
                  </NavLink>

                  <NavLink to="/contas" className={getLinkClass}>
                    Contas
                  </NavLink>

                  <NavLink to="/receitas" className={getLinkClass}>
                    Receitas
                  </NavLink>

                  <NavLink to="/usuarios" className={getLinkClass}>
                    Usuários
                  </NavLink>
                </>
              )}
            </nav> */}

            <div>
              <button>
                <img src={profile?.avatar_path} alt="Imagem do Usuário" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {profile?.role === "admin" ? "Administrador" : "Usuário"}
            </span>

            <p className="text-sm text-slate-500">Olá, {profile?.name}</p>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Sair
            </button> */}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
