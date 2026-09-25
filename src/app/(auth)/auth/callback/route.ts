import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setMembershipsForUser } from "@/lib/memberships";
import { NextResponse, type NextRequest } from "next/server";

/** Only allow redirects to paths inside this app. */
function safeNext(next: string | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) return next;
  return "/dashboard";
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const inviteToken = searchParams.get("invite");
  const organizationIds = searchParams.get("organization_ids");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createServerClient();
    const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(`${origin}/login?error=link_expired`);
    }

    if (user) {
      const adminClient = createAdminClient();

      const { data: profile } = await adminClient
        .from("users")
        .select("disclaimer_accepted")
        .eq("id", user.id)
        .single();

      // Only apply signup choices (invite, organizations) while onboarding a
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

        if (organizationIds) {
          // New accounts start as riders, whose organizations don't need approval
          await setMembershipsForUser(user.id, organizationIds.split(",").map((s) => s.trim()).filter(Boolean), false);
        }

        await adminClient
          .from("users")
          .update({
            disclaimer_accepted: true,
            disclaimer_accepted_at: new Date().toISOString(),
          })
          .eq("id", user.id);
      }
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
