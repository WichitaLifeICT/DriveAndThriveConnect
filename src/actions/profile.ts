"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";
import { setMembershipsForUser } from "@/lib/memberships";
import { normalizeUsPhone } from "@/lib/phone";
import { notifyAdmins } from "@/lib/notify";
import { revalidatePath } from "next/cache";

export async function getProfile() {
  const { user } = await requireUser();

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
  const { user } = await requireUser();

  const role = formData.get("role") as "rider" | "driver";
  if (role !== "rider" && role !== "driver") {
    return { error: "Invalid role." };
  }

  const fullName = ((formData.get("full_name") as string) || "").trim();
  if (!fullName || fullName.length > 100) return { error: "Please enter your name (up to 100 characters)." };

  let phone: string | null;
  let emergencyPhone: string | null;
  try {
    phone = normalizeUsPhone(formData.get("phone") as string);
    emergencyPhone = normalizeUsPhone(formData.get("emergency_contact_phone") as string);
  } catch (err) {
    return { error: (err as Error).message };
  }
  const emergencyName = ((formData.get("emergency_contact_name") as string) || "").trim().slice(0, 100) || null;

  const organizationIds = ((formData.get("organization_ids") as string) || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const admin = createAdminClient();

  // Anyone who drives (or has applied to) needs admin approval for new
  // orgs — otherwise a driver could switch to rider, add orgs instantly,
  // and switch back to gain organization-tier ride visibility.
  const { data: vetting } = await admin
    .from("vetted_driver_status")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  const needsApproval = role === "driver" || !!vetting;
  const { added } = await setMembershipsForUser(user.id, organizationIds, needsApproval);
  if (needsApproval && added > 0) {
    await notifyAdmins({
      type: "org_requested",
      title: `${fullName} asked to join ${added === 1 ? "an organization" : `${added} organizations`}`,
      body: "Review it on the Organizations page.",
      link: "/admin/organizations",
      skipEmail: true,
    });
  }

  const { error } = await admin
    .from("users")
    .update({
      full_name: fullName,
      phone,
      avatar_url: ((formData.get("avatar_url") as string) || "").trim() || null,
      role,
      notify_email: formData.get("notify_email") === "on",
      share_phone_when_matched: formData.get("share_phone_when_matched") === "on",
      emergency_contact_name: emergencyName,
      emergency_contact_phone: emergencyPhone,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/profile");
  return { success: true };
}
