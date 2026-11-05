"use client";

import "./globals.css";
import { ErrorView, digestOf } from "@/components/error-view";

/** Last-resort boundary (errors in the root layout). Must render its own <html>. */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="pt-BR">
      <body className="flex min-h-dvh flex-col bg-background text-text antialiased">
        <ErrorView digest={digestOf(error)} onRetry={retry} />
      </body>
    </html>
  );
}
