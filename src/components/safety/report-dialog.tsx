"use client";

import { useState } from "react";
import { fileReport } from "@/actions/safety";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { REPORT_CATEGORIES } from "@/lib/constants";

interface ReportDialogProps {
  reportedUserId?: string | null;
  reportedUserName?: string | null;
  rideRequestId?: string | null;
  threadId?: string | null;
  /** Pre-select a category (e.g. "safety_incident" from the emergency card) */
  defaultCategory?: string;
  triggerLabel?: string;
  triggerClassName?: string;
}

export function ReportDialog({
  reportedUserId,
  reportedUserName,
  rideRequestId,
  threadId,
  defaultCategory = "",
  triggerLabel = "Report a problem",
  triggerClassName = "text-sm text-red-600 hover:text-red-700",
}: ReportDialogProps) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(defaultCategory);
  const [details, setDetails] = useState("");
  const [block, setBlock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setLoading(true);
    setError(null);
    const result = await fileReport({
      category,
      details,
      reportedUserId,
      rideRequestId,
      threadId,
      block: block && !!reportedUserId,
    });
    setLoading(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setDone(true);
  }

  function close() {
    setOpen(false);
    setDone(false);
    setError(null);
    setDetails("");
    setBlock(false);
    setCategory(defaultCategory);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={triggerClassName}>
        {triggerLabel}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-title"
        >
          <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5">
            {done ? (
              <div className="text-center py-4">
                <h3 id="report-title" className="font-semibold text-gray-900 mb-2">Thank you for telling us</h3>
                <p className="text-sm text-gray-600">
                  The admins have been alerted and will follow up. If anyone is in danger right now, call 911.
                </p>
                <Button className="mt-4" onClick={close}>
                  Close
                </Button>
              </div>
            ) : (
              <>
                <h3 id="report-title" className="font-semibold text-gray-900">
                  Report a problem{reportedUserName ? ` with ${reportedUserName}` : ""}
                </h3>
                <p className="text-xs text-gray-500 mt-1 mb-4">
                  Reports go to the program admins only. If anyone is in immediate danger, call 911 first.
                </p>

                {error && (
                  <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
                )}

                <div className="space-y-2 mb-4">
                  {REPORT_CATEGORIES.map((c) => (
                    <label
                      key={c.value}
                      className={`flex items-start gap-3 p-2.5 border rounded-lg cursor-pointer ${
                        category === c.value ? "border-red-400 bg-red-50" : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="report_category"
                        value={c.value}
                        checked={category === c.value}
                        onChange={() => setCategory(c.value)}
                        className="mt-0.5 h-4 w-4 border-gray-300 text-red-600 focus:ring-red-500"
                      />
                      <span>
                        <span className="block text-sm font-medium text-gray-900">{c.label}</span>
                        <span className="block text-xs text-gray-500">{c.description}</span>
                      </span>
                    </label>
                  ))}
                </div>

                <Textarea
                  id="report_details"
                  label="What happened? (optional)"
                  rows={3}
                  maxLength={4000}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                />

                {reportedUserId && (
                  <label className="flex items-center gap-2 mt-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={block}
                      onChange={(e) => setBlock(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                    />
                    <span className="text-sm text-gray-700">
                      Also block {reportedUserName || "this person"}
                    </span>
                  </label>
                )}

                <div className="flex gap-2 mt-5">
                  <Button variant="danger" onClick={submit} loading={loading} disabled={!category}>
                    Send report
                  </Button>
                  <Button variant="secondary" onClick={close}>
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
