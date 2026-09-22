import { getAllUsers } from "@/actions/admin";
import { AdminUsersClient } from "@/components/admin/admin-users-client";

export default async function AdminUsersPage() {
  const users = await getAllUsers();

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">
        Users ({users.length})
      </h2>
      <AdminUsersClient users={users} />
    </div>
  );
}
