"use client";

import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { TabLinks } from "@/components/ui/layout";

const TABS = [
  { key: "canais", label: "Canais", href: "/settings/canais" },
  { key: "respostas", label: "Respostas", href: "/settings/respostas" },
  { key: "atendimento", label: "Atendimento", href: "/settings/atendimento" },
  { key: "equipe", label: "Equipe", href: "/settings/equipe" },
  { key: "conta", label: "Minha conta", href: "/settings/conta" },
];

function ActiveTabs() {
  const active = usePathname().split("/")[2] ?? "canais";
  return <TabLinks items={TABS} active={active} label="Seções de Ajustes" />;
}

export function SettingsTabs() {
  return (
    <Suspense fallback={<TabLinks items={TABS} active="" label="Seções de Ajustes" />}>
      <ActiveTabs />
    </Suspense>
  );
}
