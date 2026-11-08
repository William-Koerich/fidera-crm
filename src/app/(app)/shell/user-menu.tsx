"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { cx } from "@/components/ui/cx";
import { signOutAction } from "../../login/actions";

/** Account menu: who is signed in, account settings and sign out. */
export function UserMenu({
  email,
  organizationName,
  placement = "up",
  tone = "light",
}: {
  /** "plum" when shown on the dark menu. */
  tone?: "light" | "plum";
  email: string | null;
  organizationName: string;
  placement?: "up" | "down";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className={cx(
          "flex min-h-11 items-center gap-2.5 rounded-xl text-left transition-colors",
          tone === "plum" ? "bg-white/6 py-2 hover:bg-white/10" : "hover:bg-sunken",
          placement === "up" ? "w-full px-2.5" : "px-1",
        )}
      >
        <Avatar name={email?.split("@")[0]} size="sm" />
        {placement === "up" ? (
          <>
            <span className="min-w-0 flex-1">
              <span className={cx("block truncate text-sm font-semibold", tone === "plum" ? "text-white" : "text-text")}>{email ?? "Sua conta"}</span>
              <span className={cx("block truncate text-xs", tone === "plum" ? "text-on-plum-muted" : "text-text-muted")}>{organizationName}</span>
            </span>
            <Icon name="chevron-down" className={cx("size-4 rotate-180", tone === "plum" ? "text-on-plum-muted" : "text-text-muted")} />
          </>
        ) : (
          <span className="sr-only">Abrir menu da conta</span>
        )}
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className={cx(
            "absolute z-30 w-64 rounded-2xl border border-border bg-surface p-1.5 text-text shadow-lg",
            placement === "up" ? "bottom-full left-0 mb-2" : "top-full right-0 mt-2",
          )}
        >
          <p className="truncate px-2.5 py-2 text-xs text-text-muted">{email}</p>
          <Link
            role="menuitem"
            href="/settings/conta"
            onClick={() => setOpen(false)}
            className="flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm text-text hover:bg-background"
          >
            <Icon name="user" className="size-4 text-text-muted" />
            Minha conta
          </Link>
          <form action={signOutAction}>
            <button
              role="menuitem"
              type="submit"
              className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm text-text hover:bg-background"
            >
              <Icon name="logout" className="size-4 text-text-muted" />
              Sair
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
