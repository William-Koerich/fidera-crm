"use client";

import { useEffect, useRef } from "react";

/** Keeps the newest message in view when the conversation opens or a message arrives. */
export function ScrollToBottom({ token }: { token: string | undefined }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "end" });
  }, [token]);
  return <div ref={ref} aria-hidden />;
}
