"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Bottom navigation item. The active item uses the brand color. */
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`grid place-items-center ${active ? "font-semibold text-brand" : "text-text-muted"}`}
    >
      {children}
    </Link>
  );
}
