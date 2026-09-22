import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signOut } from "@/actions/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function SuspendedPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await createAdminClient()
    .from("users")
    .select("suspended_at, suspended_reason")
    .eq("id", user.id)
    .single();
  if (!profile?.suspended_at) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <Card padding="lg" className="max-w-md w-full text-center">
        <h1 className="text-lg font-semibold text-gray-900 mb-2">Your account is suspended</h1>
        <p className="text-sm text-gray-600">
          You can&apos;t request or offer rides or send messages while your account is suspended.
        </p>
        {profile.suspended_reason && (
          <p className="text-sm text-gray-700 mt-3">
            <span className="font-medium">Reason:</span> {profile.suspended_reason}
          </p>
        )}
        <p className="text-sm text-gray-600 mt-3">
          If you think this is a mistake, please contact the Drive &amp; Thrive Connect program admins.
        </p>
        <form action={signOut} className="mt-6">
          <Button type="submit" variant="secondary">Sign out</Button>
        </form>
      </Card>
    </div>
  );
}
