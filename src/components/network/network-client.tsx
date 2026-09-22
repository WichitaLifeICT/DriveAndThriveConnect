"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendFriendRequest, acceptConnection, declineConnection, removeConnection } from "@/actions/connections";
import { blockUser, unblockUser } from "@/actions/safety";
import { ReportDialog } from "@/components/safety/report-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

interface ConnectionUser {
  connectionId: string;
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
}

interface PendingRequest {
  id: string;
  requester: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    role: string | null;
  };
  created_at: string;
}

interface BlockedUser {
  blocked_id: string;
  blocked: { id: string; full_name: string | null } | null;
}

interface NetworkClientProps {
  connections: ConnectionUser[];
  pendingRequests: PendingRequest[];
  friendCode: string;
  inviteToken: string;
  blocks: BlockedUser[];
}

export function NetworkClient({
  connections,
  pendingRequests,
  friendCode,
  inviteToken,
  blocks,
}: NetworkClientProps) {
  const router = useRouter();
  const [manageId, setManageId] = useState<string | null>(null);

  async function handleRemove(connectionId: string) {
    const result = await removeConnection(connectionId);
    if (result?.error) setError(result.error);
    setManageId(null);
    router.refresh();
  }

  async function handleBlock(userId: string) {
    const result = await blockUser(userId);
    if (result?.error) setError(result.error);
    setManageId(null);
    router.refresh();
  }

  async function handleUnblock(userId: string) {
    const result = await unblockUser(userId);
    if (result?.error) setError(result.error);
    router.refresh();
  }
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const inviteLink = `${window.location.origin}/join?invite=${inviteToken}`;

  async function handleAddFriend() {
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    const result = await sendFriendRequest(code.trim());
    if (result?.error) {
      setError(result.error);
    } else if (result?.success) {
      setSuccess(`Connection request sent to ${result.name || "user"}!`);
      setCode("");
    }
    setLoading(false);
  }

  async function handleAccept(connectionId: string) {
    await acceptConnection(connectionId);
  }

  async function handleDecline(connectionId: string) {
    await declineConnection(connectionId);
  }

  async function handleCopyLink() {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">Your Network</h2>

      {/* Invite Link */}
      <Card padding="lg">
        <h3 className="font-medium text-gray-900 mb-2">Invite Someone</h3>
        <p className="text-sm text-gray-500 mb-3">
          Share your invite link. New users will be automatically connected to you.
        </p>
        <div className="flex gap-2">
          <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 truncate">
            {inviteLink}
          </div>
          <Button variant="secondary" size="sm" onClick={handleCopyLink}>
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
      </Card>

      {/* Add by Friend Code */}
      <Card padding="lg">
        <h3 className="font-medium text-gray-900 mb-2">Add by Friend Code</h3>
        <p className="text-sm text-gray-500 mb-3">
          Enter someone&apos;s friend code to send a connection request.
        </p>
        {error && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            {success}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Enter friend code"
            maxLength={6}
            className="font-mono tracking-wider"
          />
          <Button onClick={handleAddFriend} loading={loading} disabled={code.length < 4}>
            Send
          </Button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Your friend code: <span className="font-mono font-medium">{friendCode}</span>
        </p>
      </Card>

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
            Pending Requests ({pendingRequests.length})
          </h3>
          <div className="space-y-3">
            {pendingRequests.map((req) => (
              <Card key={req.id}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center text-teal-700 font-medium">
                      {(req.requester.full_name || "?")[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {req.requester.full_name || "Unknown"}
                      </p>
                      <p className="text-xs text-gray-500 capitalize">
                        {req.requester.role}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleAccept(req.id)}>
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleDecline(req.id)}
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Connections */}
      <div>
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
          Connections ({connections.length})
        </h3>
        {connections.length === 0 ? (
          <Card>
            <p className="text-sm text-gray-500 text-center py-4">
              No connections yet. Share your invite link or friend code to get started.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {connections.map((conn) => (
              <Card key={conn.connectionId}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center text-teal-700 font-medium">
                    {(conn.full_name || "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {conn.full_name || "Unknown"}
                    </p>
                    <p className="text-xs text-gray-500 capitalize">{conn.role}</p>
                  </div>
                  <button
                    className="text-xs text-gray-400 hover:text-gray-700"
                    onClick={() => setManageId(manageId === conn.connectionId ? null : conn.connectionId)}
                  >
                    {manageId === conn.connectionId ? "Close" : "Manage"}
                  </button>
                </div>
                {manageId === conn.connectionId && (
                  <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-4">
                    <button className="text-sm text-gray-600 hover:text-gray-900" onClick={() => handleRemove(conn.connectionId)}>
                      Remove connection
                    </button>
                    <button className="text-sm text-red-600 hover:text-red-700" onClick={() => handleBlock(conn.id)}>
                      Block
                    </button>
                    <ReportDialog reportedUserId={conn.id} reportedUserName={conn.full_name} triggerLabel="Report" />
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Blocked people */}
      {blocks.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
            Blocked ({blocks.length})
          </h3>
          <Card>
            <div className="space-y-2">
              {blocks.map((b) => (
                <div key={b.blocked_id} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{b.blocked?.full_name || "Unknown"}</span>
                  <button className="text-xs text-teal-600 hover:text-teal-700" onClick={() => handleUnblock(b.blocked_id)}>
                    Unblock
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Blocked people can&apos;t see your rides, message you, or send you connection requests.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
