import { createAdminClient } from "@/lib/supabase/admin";
import { SignupForm } from "@/components/auth/signup-form";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await searchParams;

  if (!invite) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
        <p className="text-gray-600">Invalid invite link. Please ask for a new one.</p>
      </div>
    );
  }

  // Invite tokens aren't readable by other users, so resolve server-side
  const admin = createAdminClient();
  const { data: inviter } = await admin
    .from("users")
    .select("full_name")
    .eq("invite_token", invite)
    .single();

  if (!inviter) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
        <p className="text-gray-600">This invite link is no longer valid.</p>
      </div>
    );
  }

  return (
    <SignupForm
      inviteToken={invite}
      inviterName={inviter.full_name || "A community member"}
    />
  );
}
