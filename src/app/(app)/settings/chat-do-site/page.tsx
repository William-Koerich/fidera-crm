import type { Metadata } from "next";
import { WebchatSettings } from "../channels";
import { SettingsPage } from "../settings-page";

export const metadata: Metadata = { title: "Chat do site" };

export default function Page() {
  return (
    <SettingsPage title="Chat do site" description="Um botão de conversa no site do seu negócio. As mensagens chegam na mesma inbox do WhatsApp.">
      <WebchatSettings />
    </SettingsPage>
  );
}
