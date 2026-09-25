import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * How the viewer knows each of the other people, e.g.
 * ["In your network", "Both in Hope CDC"] or ["Approved community driver"].
 */
export async function describeRelationships(viewerId: string, otherIds: string[]): Promise<Record<string, string[]>> {
  const ids = [...new Set(otherIds.filter((id) => id && id !== viewerId))];
  const result: Record<string, string[]> = Object.fromEntries(ids.map((id) => [id, []]));
  if (ids.length === 0) return result;

  const admin = createAdminClient();
  const idList = ids.join(",");

  const [{ data: connections }, { data: memberships }, { data: vetted }] = await Promise.all([
    admin
      .from("connections")
      .select("requester_id, addressee_id")
      .eq("status", "accepted")
      .or(
        `and(requester_id.eq.${viewerId},addressee_id.in.(${idList})),and(addressee_id.eq.${viewerId},requester_id.in.(${idList}))`
      ),
    admin
      .from("user_organizations")
      .select("user_id, organization:organizations(name, is_active)")
      .in("user_id", [viewerId, ...ids])
      .eq("status", "approved"),
    admin.from("vetted_driver_status").select("user_id").in("user_id", ids).eq("status", "approved"),
  ]);

  for (const c of connections || []) {
    const other = c.requester_id === viewerId ? c.addressee_id : c.requester_id;
    result[other]?.push("In your network");
  }

  const orgsByUser = new Map<string, Set<string>>();
  for (const m of memberships || []) {
    const org = m.organization as unknown as { name: string; is_active: boolean } | null;
    if (!org?.is_active) continue;
    if (!orgsByUser.has(m.user_id)) orgsByUser.set(m.user_id, new Set());
    orgsByUser.get(m.user_id)!.add(org.name);
  }
  const mine = orgsByUser.get(viewerId) || new Set<string>();
  for (const id of ids) {
    const shared = [...(orgsByUser.get(id) || [])].filter((o) => mine.has(o)).sort();
    if (shared.length > 0) result[id].push(`Both in ${shared.join(" & ")}`);
  }

  const vettedIds = new Set((vetted || []).map((v) => v.user_id));
  for (const id of ids) {
    if (result[id].length === 0 && vettedIds.has(id)) result[id].push("Approved community driver");
  }

  return result;
}

/** One line for display: "In your network · Both in Hope CDC". */
export function relationshipLabel(parts: string[] | undefined): string {
  return parts && parts.length > 0 ? parts.join(" · ") : "Community member";
}
