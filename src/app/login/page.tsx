import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <div className="grid gap-1">
        <p className="text-sm font-medium text-brand">Fidera</p>
        <h1 className="text-2xl font-semibold tracking-tight">Acesse sua conta</h1>
      </div>
      <Suspense fallback={<Skeleton className="h-64" />}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
