"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { suspendUser, adminConnectUsers, adminUpdateUserOrg, toggleAdmin, adminCreateUser, adminEditUser } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ORGANIZATIONS } from "@/lib/constants";
import { useRouter } from "next/navigation";
import type { User } from "@/types/database";

interface AdminUsersClientProps {
  users: User[];
}

const ROLE_CONFIG: Record<string, { label: string; bg: string; text: string; avatar: string; border: string }> = {
  rider: {
    label: "Rider",
    bg: "bg-blue-100",
    text: "text-blue-700",
    avatar: "bg-blue-100 text-blue-700",
    border: "border-blue-200",
  },
  driver: {
    label: "Driver",
    bg: "bg-green-100",
    text: "text-green-700",
    avatar: "bg-green-100 text-green-700",
    border: "border-green-200",
  },
};

type RoleFilter = "all" | "rider" | "driver";

/* ─── User Search/Select Dropdown ─── */
function UserSelector({
  users,
  selected,
  onSelect,
  excludeId,
  placeholder,
}: {
  users: User[];
  selected: User | null;
  onSelect: (user: User | null) => void;
  excludeId?: string;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return users
      .filter(
        (u) =>
          u.id !== excludeId &&
          ((u.full_name || "").toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q) ||
            u.friend_code.toLowerCase().includes(q))
      )
      .slice(0, 6);
  }, [users, query, excludeId]);

  if (selected) {
    const roleConf = ROLE_CONFIG[selected.role] || ROLE_CONFIG.rider;
    return (
      <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${roleConf.avatar}`}
        >
          {(selected.full_name || "?")[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {selected.full_name || "No name"}
          </p>
          <p className="text-xs text-gray-500 truncate">{selected.email}</p>
        </div>
        <span className="text-xs font-mono text-gray-400">{selected.friend_code}</span>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="text-gray-400 hover:text-gray-600 ml-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => query.trim() && setOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
      />
      {open && results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {results.map((u) => {
            const rc = ROLE_CONFIG[u.role] || ROLE_CONFIG.rider;
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  onSelect(u);
                  setQuery("");
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left"
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium ${rc.avatar}`}
                >
                  {(u.full_name || "?")[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 truncate">{u.full_name || "No name"}</p>
                  <p className="text-xs text-gray-500 truncate">{u.email}</p>
                </div>
                <span className="text-xs font-mono text-gray-400">{u.friend_code}</span>
              </button>
            );
          })}
        </div>
      )}
      {open && query.trim() && results.length === 0 && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg p-3">
          <p className="text-xs text-gray-500 text-center">No users found</p>
        </div>
      )}
    </div>
  );
}

/* ─── Admin Org Picker (multi-select) ─── */
function AdminOrgPicker({
  userId,
  currentOrgs,
  onSave,
}: {
  userId: string;
  currentOrgs: string | null;
  onSave: (userId: string, orgs: string) => Promise<void>;
}) {
  const parsed = currentOrgs?.split(",").filter((o) => o && o !== "none") || [];
  const [selected, setSelected] = useState<string[]>(parsed);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        if (open) {
          const newVal = selected.join(",") || "";
          const oldVal = parsed.join(",") || "";
          if (newVal !== oldVal) onSave(userId, newVal);
          setOpen(false);
        }
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  });

  function toggle(org: string) {
    setSelected((prev) =>
      prev.includes(org) ? prev.filter((o) => o !== org) : [...prev, org]
    );
  }

  const label = selected.length > 0 ? `${selected.length} org${selected.length > 1 ? "s" : ""}` : "No org";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-600 hover:bg-gray-50 whitespace-nowrap"
      >
        {label} <span className="text-gray-400">&#9662;</span>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 max-h-56 overflow-y-auto">
          {ORGANIZATIONS.map((org) => (
            <label
              key={org}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.includes(org)}
                onChange={() => toggle(org)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-xs text-gray-700">{org}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main Component ─── */
export function AdminUsersClient({ users }: AdminUsersClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [loading, setLoading] = useState<string | null>(null);

  // Connect panel state
  const [connectOpen, setConnectOpen] = useState(false);
  const [user1, setUser1] = useState<User | null>(null);
  const [user2, setUser2] = useState<User | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectMessage, setConnectMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Create user panel state
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createMessage, setCreateMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Edit user state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editMessage, setEditMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const counts = useMemo(() => {
    const c = { rider: 0, driver: 0 };
    for (const u of users) {
      if (u.role === "rider") c.rider++;
      else if (u.role === "driver") c.driver++;
    }
    return c;
  }, [users]);

  const filtered = useMemo(() => {
    let result = users;

    if (roleFilter !== "all") {
      result = result.filter((u) => u.role === roleFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (u) =>
          (u.full_name || "").toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.friend_code.toLowerCase().includes(q)
      );
    }

    return result;
  }, [users, search, roleFilter]);

  async function handleSuspend(userId: string) {
    setLoading(userId);
    await suspendUser(userId);
    router.refresh();
    setLoading(null);
  }

  async function handleConnect() {
    if (!user1 || !user2) return;
    setConnectLoading(true);
    setConnectMessage(null);

    const result = await adminConnectUsers(user1.id, user2.id);

    if (result.error) {
      setConnectMessage({ type: "error", text: result.error });
    } else {
      setConnectMessage({
        type: "success",
        text: `Connected ${user1.full_name || user1.email} and ${user2.full_name || user2.email} as friends.`,
      });
      setUser1(null);
      setUser2(null);
    }

    setConnectLoading(false);
    router.refresh();
  }

  async function handleCreateUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreateLoading(true);
    setCreateMessage(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    const result = await adminCreateUser(formData);
    if (result.error) {
      setCreateMessage({ type: "error", text: result.error });
    } else {
      setCreateMessage({ type: "success", text: `User created successfully.` });
      form.reset();
      router.refresh();
    }
    setCreateLoading(false);
  }

  async function handleEditUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingUser) return;
    setEditLoading(true);
    setEditMessage(null);
    const formData = new FormData(e.currentTarget);
    const result = await adminEditUser(editingUser.id, formData);
    if (result.error) {
      setEditMessage({ type: "error", text: result.error });
    } else {
      setEditMessage({ type: "success", text: "User updated." });
      setTimeout(() => {
        setEditingUser(null);
        setEditMessage(null);
      }, 1000);
      router.refresh();
    }
    setEditLoading(false);
  }

  return (
    <div className="space-y-4">
      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Edit User</h3>
              <button
                onClick={() => { setEditingUser(null); setEditMessage(null); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleEditUser} className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Full name</label>
                <input
                  name="full_name"
                  defaultValue={editingUser.full_name || ""}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input
                  name="email"
                  type="email"
                  defaultValue={editingUser.email}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                <input
                  name="phone"
                  type="tel"
                  defaultValue={editingUser.phone || ""}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                <select
                  name="role"
                  defaultValue={editingUser.role}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="rider">Rider</option>
                  <option value="driver">Driver</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Organization(s)</label>
                <input
                  name="organization"
                  defaultValue={editingUser.organization || ""}
                  placeholder="Comma-separated orgs"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <p className="text-[10px] text-gray-400 mt-0.5">Comma-separated: Hope 4 Da Hood,Family Promise</p>
              </div>

              {editMessage && (
                <div className={`p-2.5 rounded-lg text-sm ${
                  editMessage.type === "success"
                    ? "bg-green-50 border border-green-200 text-green-700"
                    : "bg-red-50 border border-red-200 text-red-700"
                }`}>
                  {editMessage.text}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button type="submit" size="sm" className="flex-1" loading={editLoading}>
                  Save Changes
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => { setEditingUser(null); setEditMessage(null); }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Role summary */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => setRoleFilter("all")}
          className={`rounded-xl p-3 text-center transition-colors border ${
            roleFilter === "all"
              ? "border-teal-300 bg-teal-50"
              : "border-gray-200 bg-white hover:bg-gray-50"
          }`}
        >
          <div className="text-2xl font-bold text-gray-900">{users.length}</div>
          <div className="text-xs text-gray-500 mt-0.5">All Users</div>
        </button>
        <button
          onClick={() => setRoleFilter("rider")}
          className={`rounded-xl p-3 text-center transition-colors border ${
            roleFilter === "rider"
              ? "border-blue-300 bg-blue-50"
              : "border-blue-200 bg-white hover:bg-blue-50"
          }`}
        >
          <div className="text-2xl font-bold text-blue-600">{counts.rider}</div>
          <div className="text-xs text-gray-500 mt-0.5">Riders</div>
        </button>
        <button
          onClick={() => setRoleFilter("driver")}
          className={`rounded-xl p-3 text-center transition-colors border ${
            roleFilter === "driver"
              ? "border-green-300 bg-green-50"
              : "border-green-200 bg-white hover:bg-green-50"
          }`}
        >
          <div className="text-2xl font-bold text-green-600">{counts.driver}</div>
          <div className="text-xs text-gray-500 mt-0.5">Drivers</div>
        </button>
      </div>

      {/* Connect Two Users Panel */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <button
          onClick={() => {
            setConnectOpen(!connectOpen);
            if (!connectOpen) setConnectMessage(null);
          }}
          className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <span className="text-sm font-medium text-gray-900">Connect Two Users</span>
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${connectOpen ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {connectOpen && (
          <div className="px-4 pb-4 pt-2 bg-gray-50 border-t border-gray-200 space-y-3">
            <p className="text-xs text-gray-500">
              Create a direct friend connection between two users. This skips the request/accept flow.
            </p>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-600">User 1</label>
              <UserSelector
                users={users}
                selected={user1}
                onSelect={setUser1}
                excludeId={user2?.id}
                placeholder="Search by name, email, or friend code..."
              />
            </div>

            <div className="flex justify-center">
              <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-600">User 2</label>
              <UserSelector
                users={users}
                selected={user2}
                onSelect={setUser2}
                excludeId={user1?.id}
                placeholder="Search by name, email, or friend code..."
              />
            </div>

            {connectMessage && (
              <div
                className={`p-2.5 rounded-lg text-sm ${
                  connectMessage.type === "success"
                    ? "bg-green-50 border border-green-200 text-green-700"
                    : "bg-red-50 border border-red-200 text-red-700"
                }`}
              >
                {connectMessage.text}
              </div>
            )}

            <Button
              size="sm"
              className="w-full"
              onClick={handleConnect}
              loading={connectLoading}
              disabled={!user1 || !user2}
            >
              Connect as Friends
            </Button>
          </div>
        )}
      </div>

      {/* Create User Panel */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <button
          onClick={() => {
            setCreateOpen(!createOpen);
            if (!createOpen) setCreateMessage(null);
          }}
          className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            <span className="text-sm font-medium text-gray-900">Create User</span>
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${createOpen ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {createOpen && (
          <form onSubmit={handleCreateUser} className="px-4 pb-4 pt-2 bg-gray-50 border-t border-gray-200 space-y-3">
            <p className="text-xs text-gray-500">
              Create a new rider or driver account. The user will be able to log in immediately.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Full name *</label>
                <input
                  name="full_name"
                  required
                  placeholder="Jane Doe"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                <input
                  name="phone"
                  type="tel"
                  placeholder="(316) 555-1234"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
              <input
                name="email"
                type="email"
                required
                placeholder="jane@example.com"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Password *</label>
              <input
                name="password"
                type="text"
                required
                minLength={6}
                placeholder="At least 6 characters"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Role *</label>
                <select
                  name="role"
                  defaultValue="rider"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="rider">Rider</option>
                  <option value="driver">Driver</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Organization</label>
                <select
                  name="organization"
                  defaultValue=""
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">None</option>
                  {ORGANIZATIONS.map((org) => (
                    <option key={org} value={org}>{org}</option>
                  ))}
                </select>
              </div>
            </div>

            {createMessage && (
              <div className={`p-2.5 rounded-lg text-sm ${
                createMessage.type === "success"
                  ? "bg-green-50 border border-green-200 text-green-700"
                  : "bg-red-50 border border-red-200 text-red-700"
              }`}>
                {createMessage.text}
              </div>
            )}

            <Button type="submit" size="sm" className="w-full" loading={createLoading}>
              Create User
            </Button>
          </form>
        )}
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, email, or friend code..."
        className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
      />

      <p className="text-xs text-gray-500">
        Showing {filtered.length} user{filtered.length !== 1 ? "s" : ""}
      </p>

      {/* User cards */}
      <div className="space-y-3">
        {filtered.map((user) => {
          const roleConf = ROLE_CONFIG[user.role] || ROLE_CONFIG.rider;
          return (
            <Card key={user.id} padding="sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium ${roleConf.avatar}`}
                  >
                    {(user.full_name || "?")[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {user.full_name || "No name"}
                    </p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge className={`${roleConf.bg} ${roleConf.text} text-[10px]`}>
                        {roleConf.label}
                      </Badge>
                      <span className="text-xs font-mono text-gray-400">
                        {user.friend_code}
                      </span>
                      {user.organization && user.organization !== "none" && user.organization.split(",").filter(Boolean).map((org) => (
                        <Badge key={org} className="bg-orange-100 text-orange-700 text-[10px]">
                          {org.startsWith("other: ") ? org.slice(7) : org}
                        </Badge>
                      ))}
                      {user.is_admin && (
                        <Badge className="bg-amber-100 text-amber-800 text-[10px]">
                          Admin
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setEditingUser(user)}
                  >
                    Edit
                  </Button>
                  <AdminOrgPicker
                    userId={user.id}
                    currentOrgs={user.organization}
                    onSave={async (userId, orgs) => {
                      await adminUpdateUserOrg(userId, orgs);
                      router.refresh();
                    }}
                  />
                  <Button
                    size="sm"
                    variant={user.is_admin ? "secondary" : "ghost"}
                    onClick={async () => {
                      setLoading(user.id);
                      await toggleAdmin(user.id, !user.is_admin);
                      router.refresh();
                      setLoading(null);
                    }}
                    loading={loading === user.id}
                  >
                    {user.is_admin ? "Remove Admin" : "Make Admin"}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => handleSuspend(user.id)}
                    loading={loading === user.id}
                    disabled={user.is_admin}
                  >
                    Suspend
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
