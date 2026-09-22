"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminUpdateReport, suspendUser, unsuspendUser } from "@/actions/admin";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { REPORT_CATEGORIES, REPORT_STATUSES } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils/format";
import { clsx } from "clsx";

interface Person {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  suspended_at?: string | null;
}

interface Report {
  id: string;
  category: string;
  details: string | null;
  status: "open" | "reviewing" | "resolved";
  admin_notes: string | null;
  thread_id: string | null;
  created_at: string;
  reporter: Person | null;
  reported: Person | null;
  ride: { id: string; ride_date: string; ride_time: string; pickup_address: string; dropoff_address: string; status: string } | null;
}

const FILTERS = [
  { value: "open", label: "Open" },
  { value: "reviewing", label: "Reviewing" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
];

export function AdminReportsClient({ reports, currentFilter }: { reports: Report[]; currentFilter: string }) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<string | null>(null);

  async function update(report: Report, status: Report["status"]) {
    setLoading(`${report.id}-${status}`);
    await adminUpdateReport(report.id, status, notes[report.id] ?? report.admin_notes ?? "");
    router.refresh();
    setLoading(null);
  }

  async function toggleSuspend(person: Person, reportId: string) {
    if (person.suspended_at) {
      if (!window.confirm(`Restore ${person.full_name || person.email}'s account?`)) return;
      setLoading(`${reportId}-suspend`);
      await unsuspendUser(person.id);
    } else {
      const reason = window.prompt(`Suspend ${person.full_name || person.email}? Reason (shown to them):`);
      if (reason === null) return;
      setLoading(`${reportId}-suspend`);
      const result = await suspendUser(person.id, reason);
      if (result?.error) window.alert(result.error);
    }
    router.refresh();
    setLoading(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/admin/reports?status=${f.value}`}
            className={clsx(
              "px-3 py-1.5 rounded-lg text-sm",
              currentFilter === f.value ? "bg-teal-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {reports.length === 0 && (
        <Card>
          <p className="text-sm text-gray-500 text-center py-8">No reports here.</p>
        </Card>
      )}

      {reports.map((report) => {
        const category = REPORT_CATEGORIES.find((c) => c.value === report.category);
        const status = REPORT_STATUSES[report.status];
        const urgent = report.category === "safety_incident" && report.status !== "resolved";
        return (
          <Card key={report.id} padding="lg" className={urgent ? "border-red-300 ring-1 ring-red-200" : ""}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className={clsx("font-semibold", urgent ? "text-red-700" : "text-gray-900")}>
                    {category?.label || report.category}
                  </h3>
                  <Badge className={status.color}>{status.label}</Badge>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(report.created_at)}</p>
              </div>
            </div>

            {report.details && (
              <p className="text-sm text-gray-800 mt-3 whitespace-pre-line bg-gray-50 rounded-lg p-3">{report.details}</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 text-sm">
              <div>
                <p className="text-xs text-gray-400">Reported by</p>
                {report.reporter ? (
                  <>
                    <p className="text-gray-900">{report.reporter.full_name || "No name"}</p>
                    <p className="text-xs text-gray-500">{report.reporter.email}{report.reporter.phone ? ` · ${report.reporter.phone}` : ""}</p>
                  </>
                ) : (
                  <p className="text-gray-500">Deleted account</p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-400">About</p>
                {report.reported ? (
                  <>
                    <p className="text-gray-900">
                      {report.reported.full_name || "No name"}
                      {report.reported.suspended_at && <Badge className="bg-red-100 text-red-700 ml-2 text-[10px]">Suspended</Badge>}
                    </p>
                    <p className="text-xs text-gray-500">{report.reported.email}{report.reported.phone ? ` · ${report.reported.phone}` : ""}</p>
                  </>
                ) : (
                  <p className="text-gray-500">—</p>
                )}
              </div>
            </div>

            {report.ride && (
              <p className="text-xs text-gray-500 mt-3">
                Ride {report.ride.ride_date} {report.ride.ride_time.slice(0, 5)} · {report.ride.pickup_address.split(",")[0]} →{" "}
                {report.ride.dropoff_address.split(",")[0]} · {report.ride.status}
              </p>
            )}

            <div className="flex flex-wrap gap-3 mt-3 text-sm">
              {report.thread_id && (
                <Link href={`/admin/threads/${report.thread_id}`} className="text-teal-600 hover:text-teal-700">
                  View conversation
                </Link>
              )}
              {report.reported && (
                <Link href={`/admin/threads?user=${report.reported.id}`} className="text-teal-600 hover:text-teal-700">
                  Their conversations
                </Link>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
              <Textarea
                id={`notes-${report.id}`}
                label="Admin notes (private)"
                rows={2}
                defaultValue={report.admin_notes || ""}
                onChange={(e) => setNotes({ ...notes, [report.id]: e.target.value })}
              />
              <div className="flex flex-wrap gap-2">
                {report.status !== "reviewing" && (
                  <Button size="sm" variant="secondary" loading={loading === `${report.id}-reviewing`} onClick={() => update(report, "reviewing")}>
                    Mark reviewing
                  </Button>
                )}
                {report.status !== "resolved" ? (
                  <Button size="sm" loading={loading === `${report.id}-resolved`} onClick={() => update(report, "resolved")}>
                    Resolve
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" loading={loading === `${report.id}-open`} onClick={() => update(report, "open")}>
                    Reopen
                  </Button>
                )}
                {report.reported && (
                  <Button
                    size="sm"
                    variant={report.reported.suspended_at ? "secondary" : "danger"}
                    loading={loading === `${report.id}-suspend`}
                    onClick={() => toggleSuspend(report.reported!, report.id)}
                  >
                    {report.reported.suspended_at ? "Unsuspend" : "Suspend"} {report.reported.full_name?.split(" ")[0] || "user"}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
