import { adminListOrganizations, adminGetPendingMemberships } from "@/actions/organizations";
import { getAllUsers } from "@/actions/admin";
import { AdminOrgsClient } from "@/components/admin/admin-orgs-client";

export default async function AdminOrganizationsPage() {
  const [organizations, pending, users] = await Promise.all([
    adminListOrganizations(),
    adminGetPendingMemberships(),
    getAllUsers(),
  ]);

  const unaffiliatedCount = users.filter((u) => !u.organization).length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Organizations</h2>
        <p className="text-sm text-gray-500 mt-1">
          Manage the organizations people can join, and approve drivers&apos; membership requests.
        </p>
      </div>
      <AdminOrgsClient organizations={organizations} pending={pending} unaffiliatedCount={unaffiliatedCount} />
    </div>
  );
}
