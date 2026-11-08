import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { TeamItemKind } from "@/lib/replies/team-items";
import { deleteTeamItemAction } from "./actions";

export function ItemList({
  kind,
  items,
  manage,
  empty,
  warning,
}: {
  kind: TeamItemKind;
  items: { id: string; name: string; color?: string }[];
  manage: boolean;
  empty: string;
  warning: string;
}) {
  if (items.length === 0) return <p className="text-sm text-text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border rounded-xl border border-border">
      {items.map((item) => (
        <li key={item.id} className="flex min-h-12 items-center gap-3 px-4 py-1.5">
          {item.color ? <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} /> : null}
          <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
          {manage ? (
            <ConfirmDialog
              trigger="Excluir"
              title={`Excluir "${item.name}"?`}
              description={`${warning} Isso vale só para o Fidera: no ChatPro, o item continua.`}
              confirmLabel="Excluir"
              action={deleteTeamItemAction}
              fields={{ kind, id: item.id }}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
