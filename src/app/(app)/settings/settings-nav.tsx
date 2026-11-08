"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import { cx } from "@/components/ui/cx";
import type { SettingsItem } from "./sections";

/** Submenu of Ajustes, beside the page on wide screens. */
export function SettingsNav({ sections }: { sections: { title: string; items: SettingsItem[] }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Seções de Ajustes" className="grid gap-5">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="px-3 pb-1.5 text-xs font-semibold tracking-[0.06em] text-text-muted uppercase">{section.title}</p>
          <ul className="grid gap-0.5">
            {section.items.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "flex min-h-10 items-center gap-2.5 rounded-xl px-3 text-sm transition-colors",
                      active ? "bg-surface font-semibold text-text shadow-xs ring-1 ring-border" : "text-text-muted hover:bg-sunken hover:text-text",
                    )}
                  >
                    <Icon name={item.icon} className={cx("size-4 shrink-0", active ? "text-brand" : undefined)} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
