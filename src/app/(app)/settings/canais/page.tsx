import type { Metadata } from "next";
import { Channels } from "../channels";
import { SettingsPage } from "../settings-page";

export const metadata: Metadata = { title: "WhatsApp" };

export default function ChannelsPage() {
  return (
    <SettingsPage title="WhatsApp" description="O número que recebe as mensagens dos clientes e envia as respostas.">
      <Channels />
    </SettingsPage>
  );
}
