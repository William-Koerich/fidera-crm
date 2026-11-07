"use client";

import { Input } from "@/components/ui/field";
import { CopyButton } from "@/components/ui/inputs-client";

export function WebchatSnippet({ snippet }: { snippet: string }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <label htmlFor="webchat-snippet" className="sr-only">
        Código do chat do site
      </label>
      <Input id="webchat-snippet" readOnly value={snippet} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
      <CopyButton value={snippet} label="Copiar código" className="shrink-0" />
    </div>
  );
}
