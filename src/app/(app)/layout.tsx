import Link from "next/link";
import { Suspense } from "react";
import { LogoMark, Logo } from "@/components/logo";
import { Skeleton } from "@/components/ui";
import { BottomNav, SidebarNav, type NavItem } from "./shell/nav";
import { MobileTitle, MobileUser, SidebarOrganization, SidebarUser } from "./shell/shell-data";

const MAIN_NAV: NavItem[] = [
  { href: "/inbox", label: "Inbox", icon: "inbox" },
  { href: "/settings", label: "Ajustes", icon: "settings" },
];

const showDevTools = (process.env.WHATSAPP_PROVIDER ?? "mock") === "mock";
const DEV_NAV: NavItem[] = showDevTools ? [{ href: "/dev/simulator", label: "Simulador", icon: "wrench" }] : [];

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-16 items-center px-5">
          <Link href="/inbox" aria-label="Fidera, ir para a inbox">
            <Logo size="sm" />
          </Link>
        </div>
        <div className="px-3 pb-3">
          <Suspense fallback={<Skeleton className="mx-3 h-9" />}>
            <SidebarOrganization />
          </Suspense>
        </div>
        <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto px-3 py-2">
          <SidebarNav items={MAIN_NAV} />
          {DEV_NAV.length > 0 ? (
            <div className="mt-6">
              <p className="px-3 pb-1.5 text-xs font-medium text-text-muted">Desenvolvimento</p>
              <SidebarNav items={DEV_NAV} />
            </div>
          ) : null}
        </nav>
        <div className="border-t border-border p-3">
          <Suspense fallback={<Skeleton className="h-11" />}>
            <SidebarUser />
          </Suspense>
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur lg:hidden">
          <Link href="/inbox" aria-label="Fidera, ir para a inbox">
            <LogoMark className="size-7" />
          </Link>
          <div className="min-w-0 flex-1">
            <Suspense fallback={<Skeleton className="h-5 w-32" />}>
              <MobileTitle />
            </Suspense>
          </div>
          <Suspense fallback={<Skeleton className="size-8 rounded-full" />}>
            <MobileUser />
          </Suspense>
        </header>

        <main id="conteudo" className="flex min-w-0 flex-1 flex-col">
          {children}
        </main>

        <BottomNav items={[...MAIN_NAV, ...DEV_NAV]} />
      </div>
    </div>
  );
}
