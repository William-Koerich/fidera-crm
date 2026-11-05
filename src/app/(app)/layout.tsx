import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { NavLinks, type NavItem } from "./nav-link";
import { OrgHeader } from "./org-header";

const showSimulator = (process.env.WHATSAPP_PROVIDER ?? "mock") === "mock";
const NAV_ITEMS: NavItem[] = [
  { href: "/inbox", label: "Inbox" },
  ...(showSimulator ? [{ href: "/dev/simulator", label: "Simulador" }] : []),
  { href: "/settings", label: "Ajustes" },
];

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-3 px-4">
          <Link href="/inbox" className="font-semibold text-brand">
            Fidera
          </Link>
          <Suspense fallback={<Skeleton className="h-6 w-32" />}>
            <OrgHeader />
          </Suspense>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 pb-20">{children}</div>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid h-14 max-w-3xl grid-flow-col text-center text-sm">
          <NavLinks items={NAV_ITEMS} />
        </div>
      </nav>
    </div>
  );
}
