"use server";

import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function getProfile() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();

  return data;
}

export async function updateProfile(formData: FormData) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const role = formData.get("role") as "rider" | "driver";
  const selectedOrgsRaw = (formData.get("organization") as string) || "";
  const selectedOrgs = selectedOrgsRaw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  let organization: string | null = null;
  let pending_organizations: string | null = null;

  if (role === "driver") {
    // Get current approved orgs to preserve them
    const { data: current } = await supabase
      .from("users")
      .select("organization, pending_organizations")
      .eq("id", user.id)
      .single();

    const currentApproved = (current?.organization || "")
      .split(",")
      .map((o: string) => o.trim())
      .filter(Boolean);

    // Keep approved orgs that are still selected
    const keepApproved = currentApproved.filter((o: string) => selectedOrgs.includes(o));
    // New orgs (not already approved) go to pending
    const newPending = selectedOrgs.filter((o) => !currentApproved.includes(o));

    organization = keepApproved.length > 0 ? keepApproved.join(",") : null;
    pending_organizations = newPending.length > 0 ? newPending.join(",") : null;
  } else {
    // Riders: orgs are immediate, no pending
    organization = selectedOrgs.length > 0 ? selectedOrgs.join(",") : null;
  }

  const { error } = await supabase
    .from("users")
    .update({
      full_name: formData.get("full_name") as string,
      phone: (formData.get("phone") as string) || null,
      avatar_url: (formData.get("avatar_url") as string) || null,
      role,
      organization,
      pending_organizations,
      notify_email: formData.get("notify_email") === "on",
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/profile");
  return { success: true };
}
