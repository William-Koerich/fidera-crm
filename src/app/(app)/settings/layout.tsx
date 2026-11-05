import { PageHeader } from "@/components/ui";
import { SettingsTabs } from "./settings-tabs";

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:py-10">
      <PageHeader title="Ajustes" description="Canais conectados, equipe e a sua conta." />
      <div className="mt-5 border-b border-border pb-3">
        <SettingsTabs />
      </div>
      <div className="mt-6 grid gap-6">{children}</div>
    </div>
  );
}
