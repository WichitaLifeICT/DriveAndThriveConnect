import { getConnections, getPendingRequests } from "@/actions/connections";
import { getProfile } from "@/actions/profile";
import { NetworkClient } from "@/components/network/network-client";

export default async function NetworkPage() {
  const [connections, pendingRequests, profile] = await Promise.all([
    getConnections(),
    getPendingRequests(),
    getProfile(),
  ]);

  return (
    <NetworkClient
      connections={connections}
      pendingRequests={pendingRequests}
      friendCode={profile?.friend_code || ""}
      inviteToken={profile?.invite_token || ""}
    />
  );
}
