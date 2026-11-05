"use client";

import { ErrorView, digestOf } from "@/components/error-view";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorView digest={digestOf(error)} onRetry={retry} />;
}
