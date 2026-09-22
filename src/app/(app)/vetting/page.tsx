import { getMyVettingStatus } from "@/actions/vetting";
import { VettingForm } from "@/components/vetting/vetting-form";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DRIVER_SCOPES } from "@/lib/constants";
import { formatLongDate, todayInAppZone, addDays } from "@/lib/time";

const STATUS_STYLES: Record<string, string> = {
  approved: "bg-green-100 text-green-800",
  pending: "bg-yellow-100 text-yellow-800",
  denied: "bg-red-100 text-red-800",
  expired: "bg-orange-100 text-orange-800",
  suspended: "bg-gray-100 text-gray-800",
};

export default async function VettingPage() {
  const vettingStatus = await getMyVettingStatus();
  const renewBy = addDays(todayInAppZone(), 45);
  const expiringSoon =
    vettingStatus?.status === "approved" &&
    [vettingStatus.license_expires_on, vettingStatus.insurance_expires_on].some((d: string | null) => !d || d <= renewBy);
  const canApply = !vettingStatus || ["denied", "expired"].includes(vettingStatus.status) || expiringSoon;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Approved Driver</h2>
        <p className="text-sm text-gray-500 mt-1">
          Approved drivers can see organization and community ride requests, depending on the scope they choose.
        </p>
      </div>

      {vettingStatus && (
        <Card padding="lg">
          <div className="text-center">
            <h3 className="font-medium text-gray-900 mb-2">Application Status</h3>
            <Badge className={STATUS_STYLES[vettingStatus.status] || "bg-gray-100 text-gray-800"}>
              {vettingStatus.status.charAt(0).toUpperCase() + vettingStatus.status.slice(1)}
            </Badge>
            {vettingStatus.status === "approved" && (
              <div className="mt-3 space-y-1 text-sm text-gray-600">
                <p>
                  You are an approved driver.
                  {vettingStatus.driver_scope && (
                    <> Scope: <strong>{DRIVER_SCOPES.find((s) => s.value === vettingStatus.driver_scope)?.label || vettingStatus.driver_scope}</strong></>
                  )}
                </p>
                {vettingStatus.license_expires_on && <p>License on file expires {formatLongDate(vettingStatus.license_expires_on)}.</p>}
                {vettingStatus.insurance_expires_on && <p>Insurance on file expires {formatLongDate(vettingStatus.insurance_expires_on)}.</p>}
                {!vettingStatus.reviewed_at && <p className="text-yellow-700">Your updated documents are being reviewed.</p>}
              </div>
            )}
            {vettingStatus.status === "pending" && (
              <p className="text-sm text-gray-500 mt-3">
                Your application is under review. You&apos;ll get a notification when an admin decides.
              </p>
            )}
            {vettingStatus.status === "expired" && (
              <p className="text-sm text-gray-600 mt-3">
                Your license or insurance on file expired. Upload current documents below to be approved again.
              </p>
            )}
            {vettingStatus.status === "suspended" && (
              <p className="text-sm text-gray-600 mt-3">Your driver approval is suspended. Please contact an admin.</p>
            )}
            {vettingStatus.status === "denied" && (
              <div className="mt-3">
                <p className="text-sm text-gray-500">
                  Your application was not approved. You can update your documents and apply again.
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
      )}

      {canApply && (
        <VettingForm isRenewal={vettingStatus?.status === "approved"} currentScope={vettingStatus?.driver_scope || ""} />
      )}
    </div>
  );
}
