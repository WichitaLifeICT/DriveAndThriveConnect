import { getMyVettingStatus } from "@/actions/admin";
import { VettingForm } from "@/components/vetting/vetting-form";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DRIVER_SCOPES } from "@/lib/constants";

export default async function VettingPage() {
  const vettingStatus = await getMyVettingStatus();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Community Vetted Driver</h2>
        <p className="text-sm text-gray-500 mt-1">
          Apply to become a community vetted driver for expanded visibility.
        </p>
      </div>

      {vettingStatus ? (
        <Card padding="lg">
          <div className="text-center">
            <h3 className="font-medium text-gray-900 mb-2">Application Status</h3>
            <Badge
              className={
                vettingStatus.status === "approved"
                  ? "bg-green-100 text-green-800"
                  : vettingStatus.status === "pending"
                  ? "bg-yellow-100 text-yellow-800"
                  : vettingStatus.status === "denied"
                  ? "bg-red-100 text-red-800"
                  : "bg-gray-100 text-gray-800"
              }
            >
              {vettingStatus.status.charAt(0).toUpperCase() + vettingStatus.status.slice(1)}
            </Badge>
            {vettingStatus.status === "approved" && (
              <div className="mt-3">
                <p className="text-sm text-gray-600">
                  You are a vetted driver.
                  {vettingStatus.driver_scope && (
                    <> Scope: <strong>{DRIVER_SCOPES.find(s => s.value === vettingStatus.driver_scope)?.label || vettingStatus.driver_scope}</strong></>
                  )}
                </p>
              </div>
            )}
            {vettingStatus.status === "pending" && (
              <p className="text-sm text-gray-500 mt-3">
                Your application is under review. An admin will review it shortly.
              </p>
            )}
            {vettingStatus.status === "denied" && (
              <div className="mt-3">
                <p className="text-sm text-gray-500">
                  Your application was not approved.
                </p>
                {vettingStatus.admin_notes && (
                  <p className="text-sm text-gray-600 mt-1">
                    Notes: {vettingStatus.admin_notes}
                  </p>
                )}
              </div>
            )}
          </div>
        </Card>
      ) : (
        <VettingForm />
      )}
    </div>
  );
}
