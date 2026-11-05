"use client";

import { useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonVariant } from "./button";

function SubmitButton({ label, variant }: { label: string; variant: ButtonVariant }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} loading={pending}>
      {label}
    </Button>
  );
}

/**
 * Confirmation before a sensitive action, using the native <dialog> (focus
 * trap, Esc to close). The confirm button submits `action` with `fields`.
 */
export function ConfirmDialog({
  trigger,
  triggerVariant = "danger-ghost",
  triggerClassName,
  title,
  description,
  confirmLabel,
  confirmVariant = "danger",
  action,
  fields,
}: {
  trigger: ReactNode;
  triggerVariant?: ButtonVariant;
  triggerClassName?: string;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  confirmVariant?: ButtonVariant;
  action: (formData: FormData) => void | Promise<void>;
  fields: Record<string, string>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <Button variant={triggerVariant} size="sm" className={triggerClassName} onClick={() => ref.current?.showModal()}>
        {trigger}
      </Button>
      <dialog
        ref={ref}
        aria-labelledby="confirm-title"
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-border bg-surface p-0 text-text shadow-xl backdrop:bg-text/40"
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <form
          action={async (formData) => {
            await action(formData);
            ref.current?.close();
          }}
          className="grid gap-4 p-5"
        >
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <div>
            <h2 id="confirm-title" className="text-base font-semibold">
              {title}
            </h2>
            <div className="mt-1.5 text-sm text-text-muted">{description}</div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => ref.current?.close()}>
              Cancelar
            </Button>
            <SubmitButton label={confirmLabel} variant={confirmVariant} />
          </div>
        </form>
      </dialog>
    </>
  );
}
