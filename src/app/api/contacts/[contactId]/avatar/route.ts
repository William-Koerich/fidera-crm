import type { NextRequest } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { MEDIA_BUCKET } from "@/lib/webhooks/media";

/**
 * A contact's photo for people in that business: RLS decides who finds the
 * contact. A stable address lets the browser cache it across inbox refreshes,
 * which signed URLs would not, and the query string changes after each sync.
 */
export async function GET(_request: NextRequest, { params }: RouteContext<"/api/contacts/[contactId]/avatar">) {
  const { contactId } = await params;
  const supabase = await createClient();
  const { data: contact } = await supabase.from("contacts").select("avatar_path").eq("id", contactId).maybeSingle();
  if (!contact?.avatar_path) return new Response(null, { status: 404 });

  const { data: file } = await createAdminClient().storage.from(MEDIA_BUCKET).download(contact.avatar_path);
  if (!file) return new Response(null, { status: 404 });

  return new Response(file, {
    headers: {
      "Content-Type": file.type || "image/jpeg",
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
