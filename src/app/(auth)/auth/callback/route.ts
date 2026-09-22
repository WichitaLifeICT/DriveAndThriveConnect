import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const invitedBy = searchParams.get("invited_by");
  const organization = searchParams.get("organization");

  if (code) {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.exchangeCodeForSession(code);

    if (user) {
      const adminClient = createAdminClient();

      if (invitedBy) {
        // For OAuth signups with invite links, create the connection directly
        await supabase.auth.updateUser({
          data: { invited_by: invitedBy },
        });

        await adminClient.from("connections").upsert(
          {
            requester_id: invitedBy,
            addressee_id: user.id,
            status: "accepted",
          },
          { onConflict: "requester_id,addressee_id" }
        );
      }

      // Update disclaimer acceptance and organization
      await adminClient
        .from("users")
        .update({
          disclaimer_accepted: true,
          disclaimer_accepted_at: new Date().toISOString(),
          ...(organization ? { organization } : {}),
        })
        .eq("id", user.id);
    }
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
