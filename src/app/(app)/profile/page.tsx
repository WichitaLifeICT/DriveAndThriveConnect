import { getProfile } from "@/actions/profile";
import { getMyVettingStatus } from "@/actions/vetting";
import { getActiveOrganizations, getMyOrganizations } from "@/actions/organizations";
import { ProfileForm } from "@/components/profile/profile-form";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function ProfilePage() {
  const profile = await getProfile();

  if (!profile) {
    return <div>Profile not found.</div>;
  }

  const [vettingStatus, organizations, memberships] = await Promise.all([
    getMyVettingStatus(),
    getActiveOrganizations(),
    getMyOrganizations(),
  ]);
  const role = profile.role;
  const showVetting = role === "driver";

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">Your Profile</h2>
      <ProfileForm profile={profile} organizations={organizations} memberships={memberships} />

      {/* Vetting section for drivers */}
      {showVetting && (
        <Card padding="lg">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900">Approved Driver</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Upload your license and insurance to see organization and community ride requests.
              </p>
            </div>
            {vettingStatus ? (
              <Link href="/vetting"><Badge
                className={
                  vettingStatus.status === "approved"
                    ? "bg-green-100 text-green-800"
                    : vettingStatus.status === "pending"
                    ? "bg-yellow-100 text-yellow-800"
                    : "bg-red-100 text-red-800"
                }
              >
                {vettingStatus.status.charAt(0).toUpperCase() + vettingStatus.status.slice(1)}
              </Badge></Link>
            ) : (
              <Link
                href="/vetting"
                className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors"
              >
                Apply
              </Link>
            )}
          </div>
        </Card>
      )}

      {/* Admin link */}
      {profile.is_admin && (
        <Card padding="lg">
          <Link
            href="/admin"
            className="flex items-center justify-between"
          >
            <div>
              <h3 className="font-medium text-gray-900">Admin Panel</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Manage users, vetting applications, and stats.
              </p>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </Card>
      )}
    </div>
  );
}
