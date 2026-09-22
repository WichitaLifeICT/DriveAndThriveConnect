"use client";

import { useState } from "react";
import { approveDriver, denyDriver } from "@/actions/admin";
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
  user: {
    id: string;
    full_name: string | null;
    email: string;
    avatar_url: string | null;
    role: string;
    created_at: string;
  } | null;
}

interface VettingReviewClientProps {
  applications: Application[];
}

export function VettingReviewClient({ applications }: VettingReviewClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [denyNotes, setDenyNotes] = useState<Record<string, string>>({});
  const [showDeny, setShowDeny] = useState<string | null>(null);

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
      {applications.map((app) => (
        <Card key={app.id} padding="lg">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="font-medium text-gray-900">
                {app.user?.full_name || "Unknown"}
              </p>
              <p className="text-sm text-gray-500">{app.user?.email}</p>
              <p className="text-xs text-gray-400 capitalize">Role: {app.user?.role}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">
                Applied {formatDateTime(app.created_at)}
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

          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => handleApprove(app.user_id)}
              loading={loading === app.user_id}
            >
              Approve
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
