/* eslint-disable react-refresh/only-export-components */

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

const INTERNAL_EMAIL_DOMAIN = "familia.local";

export type Profile = {
  id: string;
  name: string;
  username: string;
  role: "admin" | "common";
  active: boolean;
  salary_cents: number;
  avatar_path: string | null;
};

type LoginResult = {
  error: string | null;
};

type AuthContextValue = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<LoginResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [checkingSession, setCheckingSession] = useState(true);

  const [loadingProfile, setLoadingProfile] = useState(false);

  useEffect(() => {
    async function loadInitialSession() {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error("Erro ao recuperar sessão:", error);
      }

      setSession(data.session);
      setCheckingSession(false);
    }

    loadInitialSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (!session?.user.id) {
        setProfile(null);
        setLoadingProfile(false);
        return;
      }

      setLoadingProfile(true);

      const { data, error } = await supabase
        .from("profiles")
        .select(
          `
            id,
            name,
            username,
            role,
            active,
            salary_cents,
            avatar_path
          `,
        )
        .eq("id", session.user.id)
        .single();

      if (cancelled) {
        return;
      }

      if (error || !data) {
        console.error("Erro ao carregar perfil:", error);

        setProfile(null);
        setLoadingProfile(false);
        return;
      }

      const loadedProfile = data as Profile;

      if (!loadedProfile.active) {
        setProfile(null);
        setLoadingProfile(false);
        await supabase.auth.signOut();
        return;
      }

      setProfile(loadedProfile);
      setLoadingProfile(false);
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);

  async function signIn(
    username: string,
    password: string,
  ): Promise<LoginResult> {
    const normalizedUsername = username.trim().toLowerCase();

    if (!normalizedUsername || !password) {
      return {
        error: "Informe o usuário e a senha.",
      };
    }

    if (!/^[a-z0-9._-]+$/.test(normalizedUsername)) {
      return {
        error: "O usuário possui caracteres inválidos.",
      };
    }

    const email = `${normalizedUsername}@${INTERNAL_EMAIL_DOMAIN}`;

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error("Erro no login:", error);

      return {
        error: "Usuário ou senha incorretos.",
      };
    }

    return {
      error: null,
    };
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Erro ao sair:", error);
      throw error;
    }
  }

  const loading = checkingSession || Boolean(session && loadingProfile);

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth deve ser utilizado dentro de AuthProvider.");
  }

  return context;
}
