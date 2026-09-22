import "server-only";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Signed-in user (redirects to /login otherwise). */
export async function requireUser() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/** Signed-in, non-suspended user (redirects to /suspended otherwise). */
export async function requireActiveUser() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await createAdminClient()
    .from("users")
    .select("suspended_at")
    .eq("id", user.id)
    .single();
  if (profile?.suspended_at) redirect("/suspended");
  return { supabase, user };
}

/** Signed-in admin (redirects to /dashboard otherwise). */
export async function requireAdmin() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await createAdminClient()
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) redirect("/dashboard");
  return { supabase, user };
}
