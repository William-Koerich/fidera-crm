import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { Channels } from "../channels";

export const metadata: Metadata = { title: "Canais" };

export default function ChannelsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-56" />}>
      <Channels />
    </Suspense>
  );
}
