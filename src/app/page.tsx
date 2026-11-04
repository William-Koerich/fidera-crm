import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12">
      <div className="grid gap-2">
        <p className="text-sm font-medium text-brand">Fidera</p>
        <h1 className="text-3xl font-semibold tracking-tight">Quem você precisa chamar hoje?</h1>
        <p className="text-text-muted">
          WhatsApp e Instagram numa inbox só, e a lista diária de clientes para trazer de volta.
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/inbox"
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-brand px-4 text-sm font-medium text-white"
        >
          Abrir a inbox
        </Link>
        <Link
          href="/login"
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-border bg-surface px-4 text-sm font-medium text-info"
        >
          Entrar
        </Link>
      </div>
    </main>
  );
}
