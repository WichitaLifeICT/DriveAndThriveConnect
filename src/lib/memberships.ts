import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Replace a user's memberships with the given organization ids. New
 * memberships are approved immediately for riders; anyone who drives (or
 * has applied to) needs admin approval, since organization membership
 * widens which rides a driver can see.
 */
export async function setMembershipsForUser(userId: string, organizationIds: string[], needsApproval: boolean) {
  const admin = createAdminClient();

  const { data: validOrgs } = await admin
    .from("organizations")
    .select("id")
    .in("id", organizationIds.length > 0 ? organizationIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("is_active", true);
  const wanted = new Set((validOrgs || []).map((o) => o.id));

  const { data: current } = await admin
    .from("user_organizations")
    .select("organization_id")
    .eq("user_id", userId);
  const have = new Set((current || []).map((m) => m.organization_id));

  const toRemove = [...have].filter((id) => !wanted.has(id));
  const toAdd = [...wanted].filter((id) => !have.has(id));

  if (toRemove.length > 0) {
    await admin.from("user_organizations").delete().eq("user_id", userId).in("organization_id", toRemove);
  }
  if (toAdd.length > 0) {
    await admin.from("user_organizations").insert(
      toAdd.map((organization_id) => ({
        user_id: userId,
        organization_id,
        status: needsApproval ? "pending" : "approved",
      }))
    );
  }
  return { added: toAdd.length, removed: toRemove.length };
}
