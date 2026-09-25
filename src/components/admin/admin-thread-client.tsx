"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminSendMessage } from "@/actions/messages";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/utils/format";

interface AdminThreadMessage {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  is_admin_message: boolean;
  sender: { id: string; full_name: string | null } | null;
}

export function AdminThreadClient({
  threadId,
  riderId,
  messages,
}: {
  threadId: string;
  riderId: string;
  messages: AdminThreadMessage[];
}) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setLoading(true);
    setError(null);
    const result = await adminSendMessage(threadId, content);
    if (result?.error) setError(result.error);
    else {
      setContent("");
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <Card padding="lg">
        {messages.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">No messages yet.</p>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={
                  m.is_admin_message
                    ? "p-3 rounded-lg bg-amber-50 border border-amber-200"
                    : "p-3 rounded-lg bg-gray-50"
                }
              >
                <p className="text-xs text-gray-500 mb-1">
                  <span className="font-medium text-gray-700">
                    {m.is_admin_message ? "Admin" : m.sender_id === riderId ? "Rider" : "Driver"} ·{" "}
                    {m.sender?.full_name || "Unknown"}
                  </span>{" "}
                  · {formatDateTime(m.created_at)}
                </p>
                <p className="text-sm text-gray-900 whitespace-pre-line">{m.content}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card padding="lg">
        <h3 className="font-medium text-gray-900 mb-2">Post as admin</h3>
        <p className="text-xs text-gray-500 mb-3">
          Both people see this in the conversation with an admin label and get an email.
        </p>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        <Textarea
          id="admin_message"
          rows={3}
          maxLength={2000}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="e.g. Hi both — checking in about this ride..."
        />
        <Button className="mt-3" onClick={send} loading={loading} disabled={!content.trim()}>
          Send
        </Button>
      </Card>
    </div>
  );
}
