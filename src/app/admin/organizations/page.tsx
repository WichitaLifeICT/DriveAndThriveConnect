import { getAllUsers, getPendingOrgRequests } from "@/actions/admin";
import { AdminOrgsClient } from "@/components/admin/admin-orgs-client";

export default async function AdminOrganizationsPage() {
  const [users, pendingRequests] = await Promise.all([
    getAllUsers(),
    getPendingOrgRequests(),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Organizations</h2>
        <p className="text-sm text-gray-500 mt-1">
          Users grouped by organization membership
        </p>
      </div>
      <AdminOrgsClient users={users} pendingRequests={pendingRequests} />
    </div>
  );
}
