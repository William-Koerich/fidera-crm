import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { findChat, webchatSecret } from "@/lib/webchat/server";
import { WebchatWindow } from "./webchat-window";

export const metadata: Metadata = { title: "Chat", robots: { index: false } };

/** The chat a website shows in its frame. Public: the key only opens this business's chat. */
export default function WebchatPage({ params }: PageProps<"/w/[key]">) {
  return (
    <Suspense>
      <Chat params={params} />
    </Suspense>
  );
}

async function Chat({ params }: { params: PageProps<"/w/[key]">["params"] }) {
  const { key } = await params;
  await connection();
  const chat = webchatSecret() ? await findChat(key) : null;
  if (!chat) notFound();
  return <WebchatWindow chatKey={key} businessName={chat.businessName} />;
}
