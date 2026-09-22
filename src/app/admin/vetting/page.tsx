import { getPendingApplications } from "@/actions/admin";
import { Card } from "@/components/ui/card";
import { VettingReviewClient } from "@/components/admin/vetting-review-client";

export default async function AdminVettingPage() {
  const applications = await getPendingApplications();

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">
        Vetting Applications ({applications.length})
      </h2>

      {applications.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500 text-center py-8">
            No pending applications.
          </p>
        </Card>
      ) : (
        <VettingReviewClient applications={applications} />
      )}
    </div>
  );
}
