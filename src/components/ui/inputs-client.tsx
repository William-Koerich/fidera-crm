"use client";

import { useState, type ComponentProps } from "react";
import { Icon } from "../icons";
import { Button } from "./button";
import { cx } from "./cx";
import { Input, Select } from "./field";
import { useToast } from "./toast";

/** Copies a value and confirms with a toast. */
export function CopyButton({ value, label = "Copiar", className }: { value: string; label?: string; className?: string }) {
  const toast = useToast();
  return (
    <Button
      variant="secondary"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          toast("Link copiado");
        } catch {
          toast("Não foi possível copiar. Selecione e copie o link.", "danger");
        }
      }}
    >
      <Icon name="copy" className="size-4" />
      {label}
    </Button>
  );
}

/** Select that submits its form on change (no extra "Salvar" button). */
export function AutoSubmitSelect(props: ComponentProps<"select">) {
  return (
    <Select
      {...props}
      onChange={(e) => {
        props.onChange?.(e);
        e.currentTarget.form?.requestSubmit();
      }}
    />
  );
}

/** Password input with a show/hide toggle. */
export function PasswordInput({ className, ...props }: ComponentProps<"input">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className={cx("pr-24", className)} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        className="absolute top-1/2 right-1 min-h-9 -translate-y-1/2 rounded-md px-3 text-sm font-medium text-info hover:bg-info-soft"
      >
        {visible ? "Ocultar" : "Mostrar"}
      </button>
    </div>
  );
}
