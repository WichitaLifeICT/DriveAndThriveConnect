"use client";

import { useState, useEffect, useRef } from "react";
import { sendMessage, markThreadRead } from "@/actions/messages";
import { blockUser, unblockUser } from "@/actions/safety";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ReportDialog } from "@/components/safety/report-dialog";
import { formatRelativeTime } from "@/lib/utils/format";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Message } from "@/types/database";

type ThreadMessage = Message & { is_admin_message?: boolean };

interface MessageWithSender extends ThreadMessage {
  sender: { id: string; full_name: string | null; avatar_url: string | null } | null;
}

interface MessageThreadClientProps {
  threadId: string;
  messages: MessageWithSender[];
  currentUserId: string;
  otherUserId: string;
  otherUserName: string;
  rideId: string | null;
  rideInfo: { pickup_address: string; dropoff_address: string } | null;
  blockedByMe: boolean;
  canSend: boolean;
}

export function MessageThreadClient({
  threadId,
  messages: initialMessages,
  currentUserId,
  otherUserId,
  otherUserName,
  rideId,
  rideInfo,
  blockedByMe,
  canSend,
}: MessageThreadClientProps) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Names for realtime messages, which arrive without sender details
  const namesRef = useRef<Record<string, string>>({ [otherUserId]: otherUserName });
  for (const m of initialMessages) {
    if (m.sender?.full_name) namesRef.current[m.sender_id] = m.sender.full_name;
  }

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Opening the conversation marks it read
  useEffect(() => {
    markThreadRead(threadId).then(() => router.refresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  // Subscribe to realtime messages
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`thread:${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const newMsg = payload.new as ThreadMessage;
          setMessages((prev) => {
            if (prev.find((m) => m.id === newMsg.id)) return prev;
            const name = namesRef.current[newMsg.sender_id] || (newMsg.is_admin_message ? "Admin" : null);
            return [
              ...prev,
              {
                ...newMsg,
                sender: name ? { id: newMsg.sender_id, full_name: name, avatar_url: null } : null,
              },
            ];
          });
          if (newMsg.sender_id !== currentUserId) markThreadRead(threadId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId, currentUserId]);

  async function handleSend() {
    if (!input.trim()) return;
    const content = input.trim();
    setInput("");
    setSending(true);
    setError(null);

    // Optimistic update
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: MessageWithSender = {
      id: tempId,
      thread_id: threadId,
      sender_id: currentUserId,
      content,
      created_at: new Date().toISOString(),
      sender: null,
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    const result = await sendMessage(threadId, content);
    if (result?.error) {
      // Remove optimistic message on error and restore the text
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInput(content);
      setError(result.error);
    } else if (result?.message) {
      const saved = result.message;
      // Swap in the real id (or drop the temp copy if realtime already added it)
      setMessages((prev) =>
        prev.some((m) => m.id === saved.id)
          ? prev.filter((m) => m.id !== tempId)
          : prev.map((m) => (m.id === tempId ? { ...m, id: saved.id, created_at: saved.created_at } : m))
      );
    }
    setSending(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function toggleBlock() {
    const result = blockedByMe ? await unblockUser(otherUserId) : await blockUser(otherUserId);
    if (result?.error) setError(result.error);
    router.refresh();
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="shrink-0 pb-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700">
            &larr; Back
          </button>
          <div className="flex items-center gap-4">
            <ReportDialog
              reportedUserId={otherUserId}
              reportedUserName={otherUserName}
              threadId={threadId}
              rideRequestId={rideId}
              defaultCategory="inappropriate_message"
              triggerLabel="Report"
              triggerClassName="text-xs text-gray-400 hover:text-red-600"
            />
            <button onClick={toggleBlock} className="text-xs text-gray-400 hover:text-red-600">
              {blockedByMe ? "Unblock" : "Block"}
            </button>
          </div>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">{otherUserName}</h2>
        {rideInfo && (
          <p className="text-xs text-gray-400">
            {rideId ? (
              <Link href={`/rides/${rideId}`} className="hover:text-teal-600">
                {rideInfo.pickup_address.split(",")[0]} → {rideInfo.dropoff_address.split(",")[0]}
              </Link>
            ) : (
              <>
                {rideInfo.pickup_address.split(",")[0]} → {rideInfo.dropoff_address.split(",")[0]}
              </>
            )}
          </p>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">
            No messages yet. Start the conversation!
          </p>
        )}
        {messages.map((msg) => {
          const isMe = msg.sender_id === currentUserId && !msg.is_admin_message;
          if (msg.is_admin_message) {
            return (
              <div key={msg.id} className="flex justify-center">
                <div className="max-w-[90%] px-4 py-2 rounded-xl text-sm bg-amber-50 border border-amber-200 text-amber-900">
                  <p className="text-xs font-semibold mb-0.5">Drive &amp; Thrive admin{msg.sender?.full_name ? ` · ${msg.sender.full_name}` : ""}</p>
                  <p className="whitespace-pre-line">{msg.content}</p>
                  <p className="text-xs mt-1 text-amber-700/70">{formatRelativeTime(msg.created_at)}</p>
                </div>
              </div>
            );
          }
          return (
            <div
              key={msg.id}
              className={`flex ${isMe ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm ${
                  isMe
                    ? "bg-teal-600 text-white rounded-br-md"
                    : "bg-gray-100 text-gray-900 rounded-bl-md"
                }`}
              >
                <p className="whitespace-pre-line">{msg.content}</p>
                <p
                  className={`text-xs mt-1 ${
                    isMe ? "text-teal-200" : "text-gray-400"
                  }`}
                >
                  {!isMe && msg.sender?.full_name ? `${msg.sender.full_name.split(" ")[0]} · ` : ""}
                  {formatRelativeTime(msg.created_at)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 pt-3 border-t border-gray-200">
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        {canSend ? (
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={2000}
              placeholder="Type a message..."
              className="flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="rounded-full px-4"
              aria-label="Send"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </Button>
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center">
            {blockedByMe ? "You blocked this person. Unblock them to send messages." : "You can't send messages in this conversation."}
          </p>
        )}
      </div>
    </div>
  );
}
