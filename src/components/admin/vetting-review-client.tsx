"use client";

import { useState } from "react";
import { approveDriver, denyDriver, getVettingDocUrl } from "@/actions/vetting";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DRIVER_SCOPES } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils/format";
import { useRouter } from "next/navigation";

interface Application {
  id: string;
  user_id: string;
  license_attestation: boolean;
  insurance_attestation: boolean;
  driver_scope: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  license_expires_on: string | null;
  insurance_expires_on: string | null;
  license_doc_path: string | null;
  insurance_doc_path: string | null;
  user: {
    id: string;
    full_name: string | null;
    email: string;
    phone: string | null;
    organization: string | null;
    avatar_url: string | null;
    role: string;
    created_at: string;
  } | null;
}

interface VettingReviewClientProps {
  applications: Application[];
  /** Today's date (YYYY-MM-DD), from the server */
  today: string;
}

export function VettingReviewClient({ applications, today }: VettingReviewClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [denyNotes, setDenyNotes] = useState<Record<string, string>>({});
  const [showDeny, setShowDeny] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);

  async function openDoc(path: string) {
    setDocError(null);
    // Open the tab synchronously so pop-up blockers allow it
    const tab = window.open("", "_blank");
    const result = await getVettingDocUrl(path);
    if (result.url && tab) {
      tab.location.href = result.url;
    } else {
      tab?.close();
      setDocError(result.error || "Couldn't open the document.");
    }
  }

  function expiryLabel(date: string | null) {
    if (!date) return "not provided";
    const days = Math.round((new Date(`${date}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86_400_000);
    return `${date}${days < 0 ? " (expired)" : days < 45 ? ` (${days} days)` : ""}`;
  }

  async function handleApprove(userId: string) {
    setLoading(userId);
    await approveDriver(userId);
    router.refresh();
    setLoading(null);
  }

  async function handleDeny(userId: string) {
    setLoading(userId);
    await denyDriver(userId, denyNotes[userId]);
    router.refresh();
    setLoading(null);
  }

  function getScopeLabel(scope: string | null) {
    if (!scope) return "Not specified";
    const found = DRIVER_SCOPES.find((s) => s.value === scope);
    return found ? found.label : scope;
  }

  const scopeColors: Record<string, string> = {
    friend: "bg-blue-100 text-blue-700",
    organization: "bg-orange-100 text-orange-700",
    community: "bg-purple-100 text-purple-700",
    any: "bg-teal-100 text-teal-700",
  };

  return (
    <div className="space-y-4">
      {docError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{docError}</div>
      )}
      {applications.map((app) => (
        <Card key={app.id} padding="lg">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="font-medium text-gray-900">
                {app.user?.full_name || "Unknown"}
              </p>
              <p className="text-sm text-gray-500">{app.user?.email}</p>
              {app.user?.phone && <p className="text-sm text-gray-500">{app.user.phone}</p>}
              <p className="text-xs text-gray-400 capitalize">Role: {app.user?.role}</p>
              {app.user?.organization && (
                <p className="text-xs text-gray-400">Organizations: {app.user.organization.split(",").join(", ")}</p>
              )}
              {app.status === "approved" && (
                <Badge className="bg-blue-100 text-blue-700 mt-1">Renewal — currently approved</Badge>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">
                Submitted {formatDateTime(app.updated_at || app.created_at)}
              </p>
              <p className="text-xs text-gray-400">
                Joined {app.user?.created_at ? formatDateTime(app.user.created_at) : "N/A"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-sm mb-4">
            <div className="flex items-center gap-1">
              {app.license_attestation ? (
                <span className="text-green-500">&#10003;</span>
              ) : (
                <span className="text-red-500">&#10007;</span>
              )}
              <span className="text-gray-600">License attested</span>
            </div>
            <div className="flex items-center gap-1">
              {app.insurance_attestation ? (
                <span className="text-green-500">&#10003;</span>
              ) : (
                <span className="text-red-500">&#10007;</span>
              )}
              <span className="text-gray-600">Insurance attested</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-gray-600">Scope:</span>
              <Badge className={scopeColors[app.driver_scope || ""] || "bg-gray-100 text-gray-700"}>
                {getScopeLabel(app.driver_scope)}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 text-sm">
            <div className="p-3 rounded-lg border border-gray-200">
              <p className="font-medium text-gray-900">Driver&apos;s license</p>
              <p className="text-xs text-gray-500 mb-2">Expires {expiryLabel(app.license_expires_on)}</p>
              {app.license_doc_path ? (
                <button onClick={() => openDoc(app.license_doc_path!)} className="text-teal-600 hover:text-teal-700 text-sm">
                  View document
                </button>
              ) : (
                <p className="text-xs text-orange-600">No document (applied before uploads were required)</p>
              )}
            </div>
            <div className="p-3 rounded-lg border border-gray-200">
              <p className="font-medium text-gray-900">Insurance</p>
              <p className="text-xs text-gray-500 mb-2">Expires {expiryLabel(app.insurance_expires_on)}</p>
              {app.insurance_doc_path ? (
                <button onClick={() => openDoc(app.insurance_doc_path!)} className="text-teal-600 hover:text-teal-700 text-sm">
                  View document
                </button>
              ) : (
                <p className="text-xs text-orange-600">No document (applied before uploads were required)</p>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Check that the name matches, the documents are current, and the expiration dates entered match the documents.
          </p>

          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => handleApprove(app.user_id)}
              loading={loading === app.user_id}
            >
              {app.status === "approved" ? "Accept renewal" : "Approve"}
            </Button>
            {showDeny === app.user_id ? (
              <div className="flex-1 space-y-2">
                <Textarea
                  placeholder="Reason for denial (optional)..."
                  value={denyNotes[app.user_id] || ""}
                  onChange={(e) =>
                    setDenyNotes({ ...denyNotes, [app.user_id]: e.target.value })
                  }
                  rows={2}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => handleDeny(app.user_id)}
                    loading={loading === app.user_id}
                  >
                    Confirm Deny
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowDeny(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowDeny(app.user_id)}
              >
                Deny
              </Button>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
