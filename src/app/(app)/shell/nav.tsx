"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Icon, type IconName } from "@/components/icons";
import { cx } from "@/components/ui/cx";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

function SidebarLinks({ items, pathname }: { items: NavItem[]; pathname: string | null }) {
  return (
    <ul className="grid gap-1">
      {items.map((item) => {
        const active = pathname !== null && isActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-[0.95rem] font-medium transition-colors",
                active ? "bg-white/12 text-white" : "text-on-plum-muted hover:bg-white/8 hover:text-white",
              )}
            >
              <Icon name={item.icon} className="size-[18px]" />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function ActiveSidebarLinks({ items }: { items: NavItem[] }) {
  return <SidebarLinks items={items} pathname={usePathname()} />;
}

/** Desktop sidebar navigation, on the plum menu. */
export function SidebarNav({ items }: { items: NavItem[] }) {
  return (
    <Suspense fallback={<SidebarLinks items={items} pathname={null} />}>
      <ActiveSidebarLinks items={items} />
    </Suspense>
  );
}

/** Conversation screens use the full height on mobile (like a messaging app). */
const HIDE_BOTTOM_NAV = /^\/inbox\/[^/]+$/;

function BottomLinks({ items, pathname }: { items: NavItem[]; pathname: string | null }) {
  if (pathname && HIDE_BOTTOM_NAV.test(pathname)) return null;
  return (
    <>
      {/* Spacer so content is not hidden behind the fixed bar. */}
      <div aria-hidden className="h-[calc(4rem+env(safe-area-inset-bottom))] lg:hidden" />
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-md grid-flow-col auto-cols-fr">
          {items.map((item) => {
            const active = pathname !== null && isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold",
                    active ? "text-brand" : "text-text-muted",
                  )}
                >
                  <Icon name={item.icon} className="size-[22px]" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

function ActiveBottomLinks({ items }: { items: NavItem[] }) {
  return <BottomLinks items={items} pathname={usePathname()} />;
}

export function BottomNav({ items }: { items: NavItem[] }) {
  return (
    <Suspense fallback={<BottomLinks items={items} pathname={null} />}>
      <ActiveBottomLinks items={items} />
    </Suspense>
  );
}
