"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeUsPhone } from "@/lib/phone";
import { appUrl } from "@/lib/app-url";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function signUpWithEmail(formData: FormData) {
  const supabase = await createServerClient();
  const inviteToken = formData.get("invite_token") as string | null;
  const organizationIds = ((formData.get("organization_ids") as string) || "").trim();

  let phone: string | null;
  try {
    phone = normalizeUsPhone(formData.get("phone") as string);
  } catch (err) {
    return { error: (err as Error).message };
  }

  const password = (formData.get("password") as string) || "";
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const { error } = await supabase.auth.signUp({
    email: formData.get("email") as string,
    password,
    options: {
      emailRedirectTo: appUrl("/auth/callback"),
      data: {
        full_name: ((formData.get("full_name") as string) || "").trim().slice(0, 100),
        invite_token: inviteToken || undefined,
        organization_ids: organizationIds || undefined,
        phone: phone || undefined,
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  // After signup, record disclaimer acceptance (only possible right away
  // when email confirmation is off; otherwise the callback records it)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: true, confirmEmail: true };
  }

  await createAdminClient()
    .from("users")
    .update({
      disclaimer_accepted: true,
      disclaimer_accepted_at: new Date().toISOString(),
    })
    .eq("id", user.id);

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
    if (error.message.toLowerCase().includes("banned")) {
      return { error: "This account has been suspended. Please contact an admin." };
    }
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signInWithGoogle(inviteToken?: string, organizationIds?: string) {
  const supabase = await createServerClient();

  const redirectUrl = new URL(
    "/auth/callback",
    process.env.NEXT_PUBLIC_APP_URL!
  );
  if (inviteToken) {
    redirectUrl.searchParams.set("invite", inviteToken);
  }
  if (organizationIds) {
    redirectUrl.searchParams.set("organization_ids", organizationIds);
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
