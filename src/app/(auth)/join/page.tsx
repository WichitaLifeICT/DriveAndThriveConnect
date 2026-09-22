import { createServerClient } from "@/lib/supabase/server";
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

  const supabase = await createServerClient();
  const { data: inviter } = await supabase
    .from("users")
    .select("id, full_name, avatar_url")
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
      invitedBy={inviter.id}
      inviterName={inviter.full_name || "A community member"}
    />
  );
}
