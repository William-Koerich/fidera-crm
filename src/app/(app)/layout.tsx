import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { OrgHeader } from "./org-header";

const showSimulator = (process.env.WHATSAPP_PROVIDER ?? "mock") === "mock";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-3 px-4">
          <Link href="/inbox" className="font-semibold text-emerald-700">
            Fidera
          </Link>
          <Suspense fallback={<Skeleton className="h-6 w-32" />}>
            <OrgHeader />
          </Suspense>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 pb-20">{children}</div>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto grid h-14 max-w-3xl grid-flow-col text-center text-sm">
          <Link href="/inbox" className="grid place-items-center">
            Inbox
          </Link>
          {showSimulator ? (
            <Link href="/dev/simulator" className="grid place-items-center">
              Simulador
            </Link>
          ) : null}
          <Link href="/settings" className="grid place-items-center">
            Ajustes
          </Link>
        </div>
      </nav>
    </div>
  );
}
