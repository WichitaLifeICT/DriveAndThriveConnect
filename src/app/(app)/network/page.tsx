import { getConnections, getPendingRequests } from "@/actions/connections";
import { getProfile } from "@/actions/profile";
import { getMyBlocks } from "@/actions/safety";
import { NetworkClient } from "@/components/network/network-client";

export default async function NetworkPage() {
  const [connections, pendingRequests, profile, blocks] = await Promise.all([
    getConnections(),
    getPendingRequests(),
    getProfile(),
    getMyBlocks(),
  ]);

  return (
    <NetworkClient
      connections={connections}
      pendingRequests={pendingRequests}
      friendCode={profile?.friend_code || ""}
      inviteToken={profile?.invite_token || ""}
      blocks={blocks as unknown as { blocked_id: string; blocked: { id: string; full_name: string | null } | null }[]}
    />
  );
}
