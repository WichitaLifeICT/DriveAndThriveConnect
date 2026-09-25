import { getPendingApplications } from "@/actions/vetting";
import { Card } from "@/components/ui/card";
import { todayInAppZone } from "@/lib/time";
import { VettingReviewClient } from "@/components/admin/vetting-review-client";

export default async function AdminVettingPage() {
  const applications = await getPendingApplications();

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">
        Driver Applications &amp; Renewals ({applications.length})
      </h2>

      {applications.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500 text-center py-8">
            No pending applications.
          </p>
        </Card>
      ) : (
        <VettingReviewClient applications={applications} today={todayInAppZone()} />
      )}
    </div>
  );
}
