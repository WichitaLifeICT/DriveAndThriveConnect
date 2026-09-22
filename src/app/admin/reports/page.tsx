import { adminListReports } from "@/actions/admin";
import { AdminReportsClient } from "@/components/admin/admin-reports-client";

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter = status === "all" ? undefined : ((status as "open" | "reviewing" | "resolved") || "open");
  const reports = await adminListReports(filter);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Safety &amp; Conduct Reports</h2>
        <p className="text-sm text-gray-500 mt-1">
          Reports from riders and drivers, including no-shows. Every new report emails all admins.
        </p>
      </div>
      <AdminReportsClient reports={reports} currentFilter={status || "open"} />
    </div>
  );
}
