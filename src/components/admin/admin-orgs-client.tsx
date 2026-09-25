"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  approveMembership,
  denyMembership,
  createOrganization,
  renameOrganization,
  setOrganizationActive,
} from "@/actions/organizations";

interface OrgMember {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  is_admin: boolean;
}

interface Org {
  id: string;
  name: string;
  is_active: boolean;
  members: OrgMember[];
  pendingCount: number;
}

interface PendingMembership {
  userId: string;
  organizationId: string;
  user: { id: string; full_name: string | null; email: string; role: string };
  organization: { id: string; name: string };
}

interface AdminOrgsClientProps {
  organizations: Org[];
  pending: PendingMembership[];
  unaffiliatedCount: number;
}

const ROLE_COLORS: Record<string, string> = {
  rider: "bg-blue-100 text-blue-700",
  driver: "bg-green-100 text-green-700",
};

export function AdminOrgsClient({ organizations, pending, unaffiliatedCount }: AdminOrgsClientProps) {
  const router = useRouter();
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(key: string, action: () => Promise<{ error?: string } | { success: boolean }>) {
    setActionLoading(key);
    setError(null);
    const result = await action();
    if ("error" in result && result.error) setError(result.error);
    setActionLoading(null);
    router.refresh();
  }

  const active = organizations.filter((o) => o.is_active);
  const inactive = organizations.filter((o) => !o.is_active);

  function renderOrg(org: Org) {
    const isExpanded = expandedOrg === org.id;
    return (
      <Card key={org.id} className={isExpanded ? "ring-2 ring-orange-300" : ""}>
        <div className="flex items-center justify-between gap-2">
          <button className="flex items-center gap-2 text-left flex-1 min-w-0" onClick={() => setExpandedOrg(isExpanded ? null : org.id)}>
            <h4 className="text-sm font-semibold text-gray-900 truncate">{org.name}</h4>
            {!org.is_active && <Badge className="bg-gray-100 text-gray-500 text-[10px]">Inactive</Badge>}
            {org.pendingCount > 0 && (
              <Badge className="bg-yellow-100 text-yellow-700 text-[10px]">{org.pendingCount} pending</Badge>
            )}
          </button>
          <div className="text-right shrink-0">
            <span className="text-lg font-bold text-orange-600">{org.members.length}</span>
            <span className="text-xs text-gray-400 ml-1">member{org.members.length !== 1 ? "s" : ""}</span>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              {renaming?.id === org.id ? (
                <>
                  <Input
                    value={renaming.name}
                    onChange={(e) => setRenaming({ id: org.id, name: e.target.value })}
                    className="py-1.5"
                  />
                  <Button
                    size="sm"
                    loading={actionLoading === `rename-${org.id}`}
                    onClick={() =>
                      act(`rename-${org.id}`, async () => {
                        const r = await renameOrganization(org.id, renaming.name);
                        if (!("error" in r)) setRenaming(null);
                        return r;
                      })
                    }
                  >
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="secondary" onClick={() => setRenaming({ id: org.id, name: org.name })}>
                    Rename
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={actionLoading === `active-${org.id}`}
                    onClick={() => act(`active-${org.id}`, () => setOrganizationActive(org.id, !org.is_active))}
                  >
                    {org.is_active ? "Deactivate" : "Activate"}
                  </Button>
                </>
              )}
            </div>
            {!org.is_active && (
              <p className="text-xs text-gray-500">
                Inactive organizations are hidden from signup and profiles, and don&apos;t grant organization ride visibility.
              </p>
            )}
            {org.members.length === 0 ? (
              <p className="text-sm text-gray-500">No approved members.</p>
            ) : (
              org.members.map((user) => (
                <div key={user.id} className="flex items-center gap-3 py-1">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                      ROLE_COLORS[user.role] || "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {(user.full_name || "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{user.full_name || "No name"}</p>
                    <p className="text-xs text-gray-500 truncate">{user.email}</p>
                  </div>
                  <Badge className={`${ROLE_COLORS[user.role] || "bg-gray-100 text-gray-700"} text-[10px]`}>
                    {user.role === "rider" ? "Rider" : "Driver"}
                  </Badge>
                  {user.is_admin && <Badge className="bg-amber-100 text-amber-800 text-[10px]">Admin</Badge>}
                </div>
              ))
            )}
          </div>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      {/* Pending membership requests */}
      {pending.length > 0 && (
        <Card className="border-yellow-300 bg-yellow-50">
          <h4 className="text-sm font-semibold text-yellow-800 mb-1 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
            Pending Membership Requests ({pending.length})
          </h4>
          <p className="text-xs text-yellow-800/80 mb-3">
            Drivers need approval because organization membership lets them see that organization&apos;s ride requests.
          </p>
          <div className="space-y-2">
            {pending.map((req) => {
              const key = `${req.userId}-${req.organizationId}`;
              return (
                <div key={key} className="flex items-center gap-3 bg-white rounded-lg p-3 border border-yellow-200">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{req.user?.full_name || "No name"}</p>
                    <p className="text-xs text-gray-500">{req.user?.email}</p>
                  </div>
                  <Badge className="bg-yellow-100 text-yellow-700 text-[10px] whitespace-nowrap">
                    {req.organization?.name}
                  </Badge>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => act(`${key}-approve`, () => approveMembership(req.userId, req.organizationId))}
                      disabled={actionLoading === `${key}-approve`}
                      className="text-xs px-2.5 py-1"
                    >
                      {actionLoading === `${key}-approve` ? "..." : "Approve"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => act(`${key}-deny`, () => denyMembership(req.userId, req.organizationId))}
                      disabled={actionLoading === `${key}-deny`}
                      className="text-xs px-2.5 py-1"
                    >
                      {actionLoading === `${key}-deny` ? "..." : "Deny"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-gray-900">{active.length}</div>
          <div className="text-xs text-gray-500 mt-0.5">Active Orgs</div>
        </div>
        <div className="bg-white border border-orange-200 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-orange-600">
            {new Set(organizations.flatMap((o) => o.members.map((m) => m.id))).size}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">Affiliated Users</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-gray-400">{unaffiliatedCount}</div>
          <div className="text-xs text-gray-500 mt-0.5">Unaffiliated</div>
        </div>
      </div>

      {/* Add organization */}
      <Card>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            act("create", async () => {
              const r = await createOrganization(newName);
              if (!("error" in r)) setNewName("");
              return r;
            });
          }}
        >
          <Input placeholder="New organization name" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={100} />
          <Button type="submit" loading={actionLoading === "create"} disabled={!newName.trim()}>
            Add
          </Button>
        </form>
      </Card>

      {active.map(renderOrg)}

      {inactive.length > 0 && (
        <>
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider pt-2">
            Inactive &amp; write-in organizations
          </h3>
          {inactive.map(renderOrg)}
        </>
      )}
    </div>
  );
}
