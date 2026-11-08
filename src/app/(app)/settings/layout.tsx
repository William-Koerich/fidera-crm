import { Suspense } from "react";
import { canManage, requireMembership } from "@/lib/auth";
import { visibleSections } from "./sections";
import { SettingsNav } from "./settings-nav";

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:grid lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-10 lg:py-10">
      <aside className="hidden lg:block">
        <p className="px-3 pb-4 font-display text-2xl font-medium tracking-[-0.02em]">Ajustes</p>
        <Suspense fallback={null}>
          <Nav />
        </Suspense>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

async function Nav() {
  const me = await requireMembership();
  return <SettingsNav sections={visibleSections(canManage(me.role))} />;
}
