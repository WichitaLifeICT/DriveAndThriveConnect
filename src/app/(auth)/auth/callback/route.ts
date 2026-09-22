import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const inviteToken = searchParams.get("invite");
  const organization = searchParams.get("organization");

  if (code) {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.exchangeCodeForSession(code);

    if (user) {
      const adminClient = createAdminClient();

      const { data: profile } = await adminClient
        .from("users")
        .select("disclaimer_accepted")
        .eq("id", user.id)
        .single();

      // Only apply signup choices (invite, organization) while onboarding a
      // new account — these query params are user-controlled, so existing
      // users must not be able to replay them.
      if (profile && !profile.disclaimer_accepted) {
        if (inviteToken) {
          const { data: inviter } = await adminClient
            .from("users")
            .select("id")
            .eq("invite_token", inviteToken)
            .single();

          if (inviter && inviter.id !== user.id) {
            await adminClient.from("connections").upsert(
              {
                requester_id: inviter.id,
                addressee_id: user.id,
                status: "accepted",
              },
              { onConflict: "requester_id,addressee_id", ignoreDuplicates: true }
            );
          }
        }

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
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
