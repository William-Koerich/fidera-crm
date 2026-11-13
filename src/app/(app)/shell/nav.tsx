"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
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

/** The bar fits four screens comfortably; the rest go under "Mais". */
const BAR_ITEMS = 4;

function BottomLinks({ items, pathname }: { items: NavItem[]; pathname: string | null }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);
  // Navigating closes the sheet.
  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    setMoreOpen(false);
  }
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMoreOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  if (pathname && HIDE_BOTTOM_NAV.test(pathname)) return null;
  const overflow = items.length > BAR_ITEMS + 1;
  const bar = overflow ? items.slice(0, BAR_ITEMS) : items;
  const rest = overflow ? items.slice(BAR_ITEMS) : [];
  const restActive = rest.some((item) => pathname !== null && isActive(pathname, item.href));
  const tab = (active: boolean) =>
    cx("flex h-full w-full flex-col items-center justify-center gap-1 text-xs font-semibold", active ? "text-brand" : "text-text-muted");

  return (
    <>
      {/* Spacer so content is not hidden behind the fixed bar. */}
      <div aria-hidden className="h-[calc(4rem+env(safe-area-inset-bottom))] lg:hidden" />
      {moreOpen ? (
        <div className="fixed inset-0 z-20 lg:hidden">
          <button type="button" aria-label="Fechar menu" onClick={() => setMoreOpen(false)} className="absolute inset-0 bg-plum/30" />
          <ul
            id="more-menu"
            className="absolute inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] mx-auto grid max-w-md gap-1 rounded-2xl bg-surface p-2 shadow-lg ring-1 ring-border"
          >
            {rest.map((item) => {
              const active = pathname !== null && isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMoreOpen(false)}
                    className={cx(
                      "flex min-h-12 items-center gap-3 rounded-xl px-4 text-[0.95rem] font-medium",
                      active ? "bg-brand-soft text-brand" : "text-text hover:bg-sunken",
                    )}
                  >
                    <Icon name={item.icon} className="size-5" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-md grid-flow-col auto-cols-fr">
          {bar.map((item) => {
            const active = !moreOpen && pathname !== null && isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link href={item.href} aria-current={active ? "page" : undefined} className={tab(active)}>
                  <Icon name={item.icon} className="size-6" />
                  {item.label}
                </Link>
              </li>
            );
          })}
          {rest.length > 0 ? (
            <li>
              <button
                type="button"
                aria-expanded={moreOpen}
                aria-controls="more-menu"
                onClick={() => setMoreOpen((v) => !v)}
                className={tab(moreOpen || restActive)}
              >
                <Icon name="more" className="size-6" />
                Mais
              </button>
            </li>
          ) : null}
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
