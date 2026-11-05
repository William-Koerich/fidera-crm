"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getBrowserClient } from "@/lib/supabase/client";

/**
 * Subscribes to Supabase Realtime changes on a crm table (RLS filters rows to
 * the user's organizations) and refreshes the server-rendered view.
 */
export function RealtimeRefresh({
  table,
  filter,
  onChange,
}: {
  table: "conversations" | "messages";
  filter: string;
  onChange?: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    const supabase = getBrowserClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`crm:${table}:${filter}`)
      .on("postgres_changes", { event: "*", schema: "crm", table, filter }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          onChange?.();
          router.refresh();
        }, 250);
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [table, filter, onChange, router]);

  return null;
}
