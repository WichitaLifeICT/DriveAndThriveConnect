"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function getProfile() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Private columns (email, invite token, ...) are only readable with the
  // service role, so read the signed-in user's own row through it.
  const admin = createAdminClient();
  const { data } = await admin
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
  if (role !== "rider" && role !== "driver") {
    return { error: "Invalid role." };
  }

  const selectedOrgsRaw = (formData.get("organization") as string) || "";
  const selectedOrgs = selectedOrgsRaw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  let organization: string | null = null;
  let pending_organizations: string | null = null;

  const admin = createAdminClient();

  // Anyone who drives (or has applied to) needs admin approval for new
  // orgs — otherwise a driver could switch to rider, add orgs instantly,
  // and switch back to gain organization-tier ride visibility.
  const { data: vetting } = await admin
    .from("vetted_driver_status")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (role === "driver" || vetting) {
    // Get current approved orgs to preserve them
    const { data: current } = await admin
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

  // Organization fields aren't user-writable at the database level, so
  // write through the service role, scoped to the signed-in user.
  const { error } = await admin
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
