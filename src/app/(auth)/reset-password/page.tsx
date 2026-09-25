import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default async function ResetPasswordPage() {
  // The emailed reset link signs the user in via /auth/callback first
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/forgot-password");

  return <ResetPasswordForm />;
}
