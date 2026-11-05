"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

export interface NavItem {
  href: string;
  label: string;
}

const base = "grid place-items-center";

function ActiveLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return items.map((item) => {
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`${base} ${active ? "font-semibold text-brand" : "text-text-muted"}`}
      >
        {item.label}
      </Link>
    );
  });
}

/**
 * Bottom navigation. The active item uses the brand color. usePathname is
 * request data on dynamic routes, so the static shell renders plain links.
 */
export function NavLinks({ items }: { items: NavItem[] }) {
  return (
    <Suspense
      fallback={items.map((item) => (
        <Link key={item.href} href={item.href} className={`${base} text-text-muted`}>
          {item.label}
        </Link>
      ))}
    >
      <ActiveLinks items={items} />
    </Suspense>
  );
}
