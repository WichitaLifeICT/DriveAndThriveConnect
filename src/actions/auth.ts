"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function signUpWithEmail(formData: FormData) {
  const supabase = await createServerClient();
  const invitedBy = formData.get("invited_by") as string | null;

  const organization = formData.get("organization") as string | null;
  const phone = formData.get("phone") as string | null;

  const { error } = await supabase.auth.signUp({
    email: formData.get("email") as string,
    password: formData.get("password") as string,
    options: {
      data: {
        full_name: formData.get("full_name") as string,
        invited_by: invitedBy || undefined,
        organization: organization || undefined,
        phone: phone || undefined,
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  // After signup, update disclaimer acceptance
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const adminClient = createAdminClient();
    await adminClient
      .from("users")
      .update({
        disclaimer_accepted: true,
        disclaimer_accepted_at: new Date().toISOString(),
        phone: phone || null,
        organization: organization || null,
      })
      .eq("id", user.id);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signInWithEmail(formData: FormData) {
  const supabase = await createServerClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signInWithGoogle(invitedBy?: string, organization?: string) {
  const supabase = await createServerClient();

  const redirectUrl = new URL(
    "/auth/callback",
    process.env.NEXT_PUBLIC_APP_URL!
  );
  if (invitedBy) {
    redirectUrl.searchParams.set("invited_by", invitedBy);
  }
  if (organization) {
    redirectUrl.searchParams.set("organization", organization);
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectUrl.toString(),
    },
  });

  if (error) {
    return { error: error.message };
  }

  if (data.url) {
    redirect(data.url);
  }
}

export async function signOut() {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
