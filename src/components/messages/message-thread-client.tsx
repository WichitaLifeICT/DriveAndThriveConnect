"use client";

import { useState, useEffect, useRef } from "react";
import { sendMessage } from "@/actions/messages";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/utils/format";
import { useRouter } from "next/navigation";
import type { Message } from "@/types/database";

interface MessageWithSender extends Message {
  sender: { id: string; full_name: string | null; avatar_url: string | null } | null;
}

interface MessageThreadClientProps {
  threadId: string;
  messages: MessageWithSender[];
  currentUserId: string;
  otherUserName: string;
  rideInfo: { pickup_address: string; dropoff_address: string } | null;
}

export function MessageThreadClient({
  threadId,
  messages: initialMessages,
  currentUserId,
  otherUserName,
  rideInfo,
}: MessageThreadClientProps) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
          const newMsg = payload.new as Message;
          // Don't duplicate messages we sent ourselves
          setMessages((prev) => {
            if (prev.find((m) => m.id === newMsg.id)) return prev;
            return [
              ...prev,
              {
                ...newMsg,
                sender: null, // We don't have sender data from realtime
              },
            ];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId]);

  async function handleSend() {
    if (!input.trim()) return;
    const content = input.trim();
    setInput("");
    setSending(true);

    // Optimistic update
    const optimisticMsg: MessageWithSender = {
      id: `temp-${Date.now()}`,
      thread_id: threadId,
      sender_id: currentUserId,
      content,
      created_at: new Date().toISOString(),
      sender: null,
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    const result = await sendMessage(threadId, content);
    if (result?.error) {
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
    }
    setSending(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="shrink-0 pb-3 border-b border-gray-200">
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700">
          &larr; Back
        </button>
        <h2 className="text-lg font-semibold text-gray-900">{otherUserName}</h2>
        {rideInfo && (
          <p className="text-xs text-gray-400">
            {rideInfo.pickup_address.split(",")[0]} → {rideInfo.dropoff_address.split(",")[0]}
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
          const isMe = msg.sender_id === currentUserId;
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
                <p>{msg.content}</p>
                <p
                  className={`text-xs mt-1 ${
                    isMe ? "text-teal-200" : "text-gray-400"
                  }`}
                >
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
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="rounded-full px-4"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </Button>
        </div>
      </div>
    </div>
  );
}
