"use client";

import { useState } from "react";
import Link from "next/link";
import { updateProfile } from "@/actions/profile";
import { signOut } from "@/actions/auth";
import { deleteMyAccount } from "@/actions/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ROLES } from "@/lib/constants";
import type { User } from "@/types/database";

interface ProfileFormProps {
  profile: User & {
    emergency_contact_name?: string | null;
    emergency_contact_phone?: string | null;
    share_phone_when_matched?: boolean;
  };
  organizations: { id: string; name: string }[];
  memberships: { id: string; name: string; status: "approved" | "pending" }[];
}

export function ProfileForm({ profile, organizations, memberships }: ProfileFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const isDriver = profile.role === "driver";
  const membershipStatus = new Map(memberships.map((m) => [m.id, m.status]));
  const [selectedOrgs, setSelectedOrgs] = useState<string[]>(() => memberships.map((m) => m.id));
  const [notifyEmail, setNotifyEmail] = useState(profile.notify_email ?? true);
  const [sharePhone, setSharePhone] = useState(profile.share_phone_when_matched ?? true);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Organizations the user belongs to that are no longer offered still show
  const orgOptions = [
    ...organizations,
    ...memberships.filter((m) => !organizations.some((o) => o.id === m.id)).map((m) => ({ id: m.id, name: m.name })),
  ];

  async function handleDelete(formData: FormData) {
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteMyAccount(formData);
    if (result?.error) {
      setDeleteError(result.error);
      setDeleting(false);
    }
  }

  const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/join?invite=${profile.invite_token}`;

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    setSuccess(false);
    const result = await updateProfile(formData);
    if (result?.error) {
      setError(result.error);
    } else {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
    setLoading(false);
  }

  async function handleCopy(text: string, type: "code" | "link") {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for insecure contexts (http://localhost)
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join me on Drive & Thrive Connect",
          text: "Connect with me for community ride coordination!",
          url: inviteLink,
        });
        return;
      } catch {
        // User cancelled or share failed — fall back to copy
      }
    }
    handleCopy(inviteLink, "link");
  }

  return (
    <div className="space-y-6">
      {/* Friend Code & Invite Link */}
      <Card padding="lg">
        <h3 className="font-medium text-gray-900 mb-4">Share & Connect</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-500 mb-1">Your Friend Code</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 font-mono text-lg tracking-wider text-gray-900">
                {profile.friend_code}
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleCopy(profile.friend_code, "code")}
              >
                {copied === "code" ? "Copied!" : "Copy"}
              </Button>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-1">Your Invite Link</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-600 truncate">
                {inviteLink}
              </div>
              <Button variant="secondary" size="sm" onClick={() => handleCopy(inviteLink, "link")}>
                {copied === "link" ? "Copied!" : "Copy"}
              </Button>
              {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
                <Button variant="secondary" size="sm" onClick={handleShare}>
                  Share
                </Button>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              New users who sign up with your link are automatically connected to you.
            </p>
          </div>
        </div>
      </Card>

      {/* Profile Edit Form */}
      <Card padding="lg">
        <h3 className="font-medium text-gray-900 mb-4">Edit Profile</h3>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            Profile updated successfully.
          </div>
        )}

        <form action={handleSubmit} className="space-y-4">
          <Input
            id="full_name"
            name="full_name"
            label="Full name"
            defaultValue={profile.full_name || ""}
            required
          />
          <Input
            id="phone"
            name="phone"
            type="tel"
            label="Phone number"
            defaultValue={profile.phone || ""}
            placeholder="(316) 555-1234"
          />
          <Input
            id="avatar_url"
            name="avatar_url"
            label="Photo URL (optional)"
            defaultValue={profile.avatar_url || ""}
            placeholder="https://..."
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              name="role"
              defaultValue={profile.role}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Organization(s)</label>
            {isDriver && (
              <p className="text-xs text-gray-500 mb-2">New organizations require admin approval</p>
            )}
            <input type="hidden" name="organization_ids" value={selectedOrgs.join(",")} />
            <div className="space-y-1.5">
              {orgOptions.map((org) => {
                const status = membershipStatus.get(org.id);
                const checked = selectedOrgs.includes(org.id);
                return (
                  <label
                    key={org.id}
                    className={`flex items-center gap-2.5 p-2 border rounded-lg cursor-pointer transition-colors ${
                      checked ? "border-teal-500 bg-teal-50" : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedOrgs((prev) =>
                          prev.includes(org.id) ? prev.filter((o) => o !== org.id) : [...prev, org.id]
                        )
                      }
                      className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                    />
                    <span className="text-sm text-gray-900 flex-1">{org.name}</span>
                    {status === "approved" && isDriver && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                        Approved
                      </span>
                    )}
                    {status === "pending" && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">
                        Pending
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Safety */}
          <div className="pt-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Emergency contact</label>
            <p className="text-xs text-gray-500 mb-2">
              Someone you trust. You can text them a live trip link from any matched ride. Only you see this.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Input
                id="emergency_contact_name"
                name="emergency_contact_name"
                placeholder="Name"
                maxLength={100}
                defaultValue={profile.emergency_contact_name || ""}
              />
              <Input
                id="emergency_contact_phone"
                name="emergency_contact_phone"
                type="tel"
                placeholder="(316) 555-1234"
                defaultValue={profile.emergency_contact_phone || ""}
              />
            </div>
          </div>

          <label
            className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
              sharePhone ? "border-teal-500 bg-teal-50" : "border-gray-200 hover:bg-gray-50"
            }`}
          >
            <input
              type="checkbox"
              name="share_phone_when_matched"
              checked={sharePhone}
              onChange={(e) => setSharePhone(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-900">Share my phone number after a ride is matched</span>
              <p className="text-xs text-gray-500">Only your matched rider or driver sees it, and only until the ride ends.</p>
            </div>
          </label>

          {/* Notification Preferences */}
          {(
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Notifications</label>
              <label
                className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                  notifyEmail ? "border-teal-500 bg-teal-50" : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <input
                  type="checkbox"
                  name="notify_email"
                  checked={notifyEmail}
                  onChange={(e) => setNotifyEmail(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">Email notifications</span>
                  <p className="text-xs text-gray-500">
                    {isDriver
                      ? "New ride requests you can take, offers, messages and reminders"
                      : "Offers on your rides, messages and reminders"}
                    . Safety and account emails are always sent.
                  </p>
                </div>
              </label>
            </div>
          )}

          <Button type="submit" loading={loading}>
            Save Changes
          </Button>
        </form>
      </Card>

      {/* Account */}
      <Card padding="lg">
        <h3 className="font-medium text-gray-900 mb-3">Account</h3>
        <div className="space-y-2 text-sm">
          <Link href="/reset-password" className="block text-teal-600 hover:text-teal-700">
            Change password
          </Link>
          <a href="/api/me/export" className="block text-teal-600 hover:text-teal-700">
            Download my data
          </a>
          <button onClick={() => setShowDelete(!showDelete)} className="block text-red-600 hover:text-red-700">
            Delete my account
          </button>
        </div>

        {showDelete && (
          <form action={handleDelete} className="mt-4 p-3 border border-red-200 bg-red-50 rounded-lg space-y-3">
            <p className="text-sm text-red-800">
              This permanently deletes your account, rides, messages and connections. Any matched rides are cancelled
              and the other person is told. This can&apos;t be undone.
            </p>
            {deleteError && <p className="text-sm text-red-700">{deleteError}</p>}
            <Input id="confirm" name="confirm" label="Type DELETE to confirm" autoComplete="off" />
            <Button type="submit" variant="danger" loading={deleting}>
              Permanently delete my account
            </Button>
          </form>
        )}
      </Card>

      {/* Sign Out */}
      <Card padding="lg">
        <form action={signOut}>
          <Button type="submit" variant="secondary" className="w-full">
            Sign Out
          </Button>
        </form>
      </Card>
    </div>
  );
}
