import { NavLink, Outlet } from "react-router";

import { useEffect, useRef, useState } from "react";

import { useAuth } from "../contexts/AuthContext";
import { UserAvatar } from "../components/UserAvatar";

function getLinkClass({ isActive }: { isActive: boolean }) {
  const baseClass =
    "relative whitespace-nowrap transition before:content-[''] before:transition before:absolute before:w-full before:h-px before:-bottom-[23px]";

  if (isActive) {
    return `${baseClass} text-indigo-500 font-semibold before:bg-indigo-500`;
  }

  return `${baseClass} text-slate-400 hover:text-slate-600 hover:before:bg-slate-400`;
}

export function AppLayout() {
  const { profile, signOut } = useAuth();

  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  async function handleLogout() {
    try {
      setIsProfileMenuOpen(false);
      await signOut();
    } catch {
      window.alert("Não foi possível encerrar a sessão.");
    }
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target as Node)
      ) {
        setIsProfileMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsProfileMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);

      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <header className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 pb-3 pt-3.5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <a href="/" className="flex items-center gap-2">
            <img className="max-w-15 transition hover:scale-105" src="/images/logo.png" alt="logo" />
          </a>

          <div className="flex items-center gap-8">
            <nav className="flex gap-6 mt-px">
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
            </nav>

            <span className="w-px h-6 bg-slate-300" />

            {profile && (
              <div ref={profileMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() =>
                    setIsProfileMenuOpen((currentValue) => !currentValue)
                  }
                  aria-label="Abrir menu do perfil"
                  aria-expanded={isProfileMenuOpen}
                  className="group flex cursor-pointer items-center rounded-full outline-none"
                >
                  <UserAvatar
                    name={profile.name}
                    avatarPath={profile.avatar_path}
                    size={45}
                    className="border-2 border-slate-100 ring-2 ring-indigo-500 transition-all group-hover:ring-3 group-focus:ring-3"
                  />
                </button>

                {isProfileMenuOpen && (
                  <div className="absolute right-0 top-[calc(100%+12px)] z-50 overflow-hidden rounded-b-md border border-slate-200 bg-white shadow-xl">
                    <div className="p-4">
                      <div className="flex items-center gap-8">
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            name={profile.name}
                            avatarPath={profile.avatar_path}
                            size={48}
                            className="ring-2 ring-indigo-200"
                          />

                          <div className="min-w-0">
                            <p className="truncate font-bold text-slate-900">
                              {profile.name}
                            </p>

                            <p className="truncate text-xs text-slate-500">
                              @{profile.username}
                            </p>
                          </div>
                        </div>

                        <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
                          {profile.role === "admin"
                            ? "Administrador"
                            : "Usuário"}
                        </span>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 p-2">
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="mt-1 w-full cursor-pointer rounded-md px-3 py-2.5 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
                      >
                        Sair da conta
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
