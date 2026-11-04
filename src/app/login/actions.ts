"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrigin, safeNextPath } from "@/lib/urls";

export interface LoginState {
  status: "idle" | "error" | "sent";
  message?: string;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const mode = String(formData.get("mode") ?? "password");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(formData.get("next"));

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: "error", message: "Informe um e-mail válido." };
  }

  const supabase = await createClient();
  const emailRedirectTo = `${await getOrigin()}/auth/confirm?next=${encodeURIComponent(next)}`;

  if (mode === "magic") {
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } });
    if (error) return { status: "error", message: "Não foi possível enviar o link. Tente de novo em instantes." };
    return { status: "sent", message: "Enviamos um link de acesso para o seu e-mail." };
  }

  if (password.length < 8) {
    return { status: "error", message: "A senha precisa ter pelo menos 8 caracteres." };
  }

  if (mode === "signup") {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo } });
    if (error) return { status: "error", message: "Não foi possível criar a conta. Verifique os dados." };
    if (!data.session) {
      return { status: "sent", message: "Conta criada. Confirme pelo link que enviamos para o seu e-mail." };
    }
    redirect(next);
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { status: "error", message: "E-mail ou senha incorretos." };
  redirect(next);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
