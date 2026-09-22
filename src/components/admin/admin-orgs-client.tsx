"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ORGANIZATIONS } from "@/lib/constants";
import { approveUserOrg, denyUserOrg } from "@/actions/admin";
import type { User } from "@/types/database";

interface AdminOrgsClientProps {
  users: User[];
  pendingRequests: {
    id: string;
    full_name: string | null;
    email: string;
    role: string;
    organization: string | null;
    pending_organizations: string | null;
  }[];
}

const ROLE_COLORS: Record<string, string> = {
  rider: "bg-blue-100 text-blue-700",
  driver: "bg-green-100 text-green-700",
};

export function AdminOrgsClient({ users, pendingRequests }: AdminOrgsClientProps) {
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function handleApprove(userId: string, org: string) {
    setActionLoading(`${userId}-${org}-approve`);
    await approveUserOrg(userId, org);
    setActionLoading(null);
  }

  async function handleDeny(userId: string, org: string) {
    setActionLoading(`${userId}-${org}-deny`);
    await denyUserOrg(userId, org);
    setActionLoading(null);
  }

  const orgGroups = useMemo(() => {
    const groups: Record<string, User[]> = {};

    // Initialize all known orgs
    for (const org of ORGANIZATIONS) {
      groups[org] = [];
    }

    // Group users by their org(s)
    for (const user of users) {
      if (!user.organization || user.organization === "none") continue;
      const orgs = user.organization.split(",").filter(Boolean);
      for (const org of orgs) {
        const cleanOrg = org.startsWith("other: ") ? org : org;
        if (!groups[cleanOrg]) groups[cleanOrg] = [];
        groups[cleanOrg].push(user);
      }
    }

    // Sort by member count descending, filter out empty
    return Object.entries(groups)
      .filter(([, members]) => members.length > 0)
      .sort((a, b) => b[1].length - a[1].length);
  }, [users]);

  const unaffiliated = useMemo(
    () => users.filter((u) => !u.organization || u.organization === "none"),
    [users]
  );

  return (
    <div className="space-y-3">
      {/* Pending Org Requests */}
      {pendingRequests.length > 0 && (
        <Card className="border-yellow-300 bg-yellow-50">
          <h4 className="text-sm font-semibold text-yellow-800 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
            Pending Organization Requests ({pendingRequests.length})
          </h4>
          <div className="space-y-2">
            {pendingRequests.map((req) => {
              const orgs = (req.pending_organizations || "")
                .split(",")
                .map((o) => o.trim())
                .filter(Boolean);
              return orgs.map((org) => (
                <div
                  key={`${req.id}-${org}`}
                  className="flex items-center gap-3 bg-white rounded-lg p-3 border border-yellow-200"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {req.full_name || "No name"}
                    </p>
                    <p className="text-xs text-gray-500">{req.email}</p>
                  </div>
                  <Badge className="bg-yellow-100 text-yellow-700 text-[10px] whitespace-nowrap">
                    {org}
                  </Badge>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => handleApprove(req.id, org)}
                      disabled={actionLoading === `${req.id}-${org}-approve`}
                      className="text-xs px-2.5 py-1"
                    >
                      {actionLoading === `${req.id}-${org}-approve` ? "..." : "Approve"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleDeny(req.id, org)}
                      disabled={actionLoading === `${req.id}-${org}-deny`}
                      className="text-xs px-2.5 py-1"
                    >
                      {actionLoading === `${req.id}-${org}-deny` ? "..." : "Deny"}
                    </Button>
                  </div>
                </div>
              ));
            })}
          </div>
        </Card>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-gray-900">{orgGroups.length}</div>
          <div className="text-xs text-gray-500 mt-0.5">Active Orgs</div>
        </div>
        <div className="bg-white border border-orange-200 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-orange-600">
            {users.filter((u) => u.organization && u.organization !== "none").length}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">Affiliated Users</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-gray-400">{unaffiliated.length}</div>
          <div className="text-xs text-gray-500 mt-0.5">Unaffiliated</div>
        </div>
      </div>

      {/* Org cards */}
      {orgGroups.map(([orgName, members]) => {
        const isExpanded = expandedOrg === orgName;
        const displayName = orgName.startsWith("other: ") ? orgName.slice(7) : orgName;
        const isPreset = (ORGANIZATIONS as readonly string[]).includes(orgName);

        return (
          <Card
            key={orgName}
            className={`cursor-pointer ${isExpanded ? "ring-2 ring-orange-300" : ""}`}
            onClick={() => setExpandedOrg(isExpanded ? null : orgName)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-gray-900">{displayName}</h4>
                {!isPreset && (
                  <Badge className="bg-gray-100 text-gray-500 text-[10px]">Custom</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <span className="text-lg font-bold text-orange-600">{members.length}</span>
                  <span className="text-xs text-gray-400 ml-1">
                    member{members.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <svg
                  className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {isExpanded && (
              <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                {members.map((user) => (
                  <div key={user.id} className="flex items-center gap-3 py-1">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                        ROLE_COLORS[user.role] || "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {(user.full_name || "?")[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {user.full_name || "No name"}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    </div>
                    <Badge className={`${ROLE_COLORS[user.role] || "bg-gray-100 text-gray-700"} text-[10px]`}>
                      {user.role === "rider" ? "Rider" : "Driver"}
                    </Badge>
                    {user.is_admin && (
                      <Badge className="bg-amber-100 text-amber-800 text-[10px]">Admin</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}

      {orgGroups.length === 0 && (
        <Card>
          <p className="text-sm text-gray-500 text-center py-6">
            No users are currently affiliated with any organization.
          </p>
        </Card>
      )}
    </div>
  );
}
