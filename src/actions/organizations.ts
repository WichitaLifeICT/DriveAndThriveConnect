"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, requireUser } from "@/lib/auth";
import { notifyUser } from "@/lib/notify";
import { revalidatePath } from "next/cache";
import { setMembershipsForUser } from "@/lib/memberships";

export interface Organization {
  id: string;
  name: string;
  is_active: boolean;
}

/** Organizations people can pick at signup and on their profile. */
export async function getActiveOrganizations(): Promise<Organization[]> {
  const { data } = await createAdminClient()
    .from("organizations")
    .select("id, name, is_active")
    .eq("is_active", true)
    .order("name");
  return data || [];
}

export async function getMyOrganizations() {
  const { user } = await requireUser();
  const { data } = await createAdminClient()
    .from("user_organizations")
    .select("status, organization:organizations(id, name, is_active)")
    .eq("user_id", user.id);
  return (data || []).map((m) => ({
    status: m.status as "approved" | "pending",
    ...(m.organization as unknown as Organization),
  }));
}

// ==================== Admin ====================

export async function adminListOrganizations() {
  await requireAdmin();
  const admin = createAdminClient();
  const [{ data: orgs }, { data: memberships }] = await Promise.all([
    admin.from("organizations").select("id, name, is_active, created_at").order("name"),
    admin
      .from("user_organizations")
      .select("organization_id, status, user:users!user_id(id, full_name, email, role, is_admin)"),
  ]);

  return (orgs || []).map((org) => {
    const members = (memberships || []).filter((m) => m.organization_id === org.id);
    return {
      ...org,
      members: members
        .filter((m) => m.status === "approved")
        .map((m) => m.user as unknown as { id: string; full_name: string | null; email: string; role: string; is_admin: boolean }),
      pendingCount: members.filter((m) => m.status === "pending").length,
    };
  });
}

export async function adminGetPendingMemberships() {
  await requireAdmin();
  const { data } = await createAdminClient()
    .from("user_organizations")
    .select("user_id, organization_id, created_at, user:users!user_id(id, full_name, email, role), organization:organizations(id, name)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  return (data || []).map((m) => ({
    userId: m.user_id,
    organizationId: m.organization_id,
    createdAt: m.created_at,
    user: m.user as unknown as { id: string; full_name: string | null; email: string; role: string },
    organization: m.organization as unknown as { id: string; name: string },
  }));
}

export async function createOrganization(name: string) {
  await requireAdmin();
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 100) return { error: "Organization name must be 1–100 characters." };
  const { error } = await createAdminClient().from("organizations").insert({ name: trimmed });
  if (error) return { error: error.code === "23505" ? "That organization already exists." : error.message };
  revalidatePath("/admin/organizations");
  return { success: true };
}

export async function renameOrganization(id: string, name: string) {
  await requireAdmin();
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 100) return { error: "Organization name must be 1–100 characters." };
  const { error } = await createAdminClient().from("organizations").update({ name: trimmed }).eq("id", id);
  if (error) return { error: error.code === "23505" ? "That name is already used." : error.message };
  revalidatePath("/admin/organizations");
  return { success: true };
}

/** Inactive organizations are hidden from pickers and don't grant visibility. */
export async function setOrganizationActive(id: string, isActive: boolean) {
  await requireAdmin();
  const { error } = await createAdminClient().from("organizations").update({ is_active: isActive }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/organizations");
  return { success: true };
}

export async function approveMembership(userId: string, organizationId: string) {
  await requireAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_organizations")
    .update({ status: "approved" })
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .select("organization:organizations(name)");
  if (error) return { error: error.message };

  const orgName = (data?.[0]?.organization as unknown as { name: string } | undefined)?.name;
  await notifyUser(userId, {
    type: "org_approved",
    title: `You've been approved for ${orgName || "an organization"}`,
    body: "You'll now see organization ride requests that match your driving scope.",
    link: "/profile",
  });

  revalidatePath("/admin/organizations");
  revalidatePath("/admin/users");
  return { success: true };
}

export async function denyMembership(userId: string, organizationId: string) {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: org } = await admin.from("organizations").select("name").eq("id", organizationId).single();
  const { error } = await admin
    .from("user_organizations")
    .delete()
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .eq("status", "pending");
  if (error) return { error: error.message };

  await notifyUser(userId, {
    type: "org_denied",
    title: `Your request to join ${org?.name || "an organization"} wasn't approved`,
    body: "Contact an admin if you think this is a mistake.",
    link: "/profile",
  });

  revalidatePath("/admin/organizations");
  revalidatePath("/admin/users");
  return { success: true };
}

/** Admin sets a user's organizations by id; admin choices are approved. */
export async function adminSetUserOrganizations(userId: string, organizationIds: string[]) {
  await requireAdmin();
  const admin = createAdminClient();
  await setMembershipsForUser(userId, organizationIds, false);
  // Anything the admin kept is approved, even if it was pending
  if (organizationIds.length > 0) {
    await admin
      .from("user_organizations")
      .update({ status: "approved" })
      .eq("user_id", userId)
      .in("organization_id", organizationIds);
  }
  revalidatePath("/admin/users");
  revalidatePath("/admin/organizations");
  return { success: true };
}
