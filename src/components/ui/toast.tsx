"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../icons";
import { cx } from "./cx";

type ToastTone = "success" | "danger" | "info";
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

const ToastContext = createContext<((message: string, tone?: ToastTone) => void) | null>(null);

/** Short, non-blocking confirmations ("Link copiado"). Announced politely to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const show = useCallback((message: string, tone: ToastTone = "success") => {
    const id = nextId.current++;
    setItems((current) => [...current.slice(-2), { id, tone, message }]);
    setTimeout(() => setItems((current) => current.filter((t) => t.id !== id)), 4000);
  }, []);

  return (
    <ToastContext value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto flex items-center gap-2 rounded-lg bg-text px-3.5 py-2.5 text-sm text-white shadow-lg",
              "motion-safe:animate-[toast-in_160ms_ease-out]",
            )}
          >
            <Icon
              name={t.tone === "danger" ? "alert" : t.tone === "info" ? "info" : "check"}
              className={cx("size-4", t.tone === "danger" ? "text-red-300" : "text-emerald-300")}
            />
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast() {
  const show = useContext(ToastContext);
  return show ?? (() => {});
}

/** Shows a toast once when `message` changes (e.g. from a server action state). */
export function ToastOnChange({ message, tone, nonce }: { message?: string; tone?: ToastTone; nonce?: unknown }) {
  const toast = useToast();
  useEffect(() => {
    if (message) toast(message, tone);
  }, [message, tone, nonce, toast]);
  return null;
}
