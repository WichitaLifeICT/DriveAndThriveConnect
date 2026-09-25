import { getImpactReport } from "@/actions/admin";
import { Card } from "@/components/ui/card";
import { addDays, todayInAppZone } from "@/lib/time";
import type { ImpactSummary } from "@/lib/impact";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function pct(v: number | null) {
  return v === null ? "—" : `${v}%`;
}

function duration(minutes: number | null) {
  if (minutes === null) return "—";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 60 * 48) return `${Math.round(minutes / 6) / 10} hr`;
  return `${Math.round(minutes / 144) / 10} days`;
}

function SummaryTable({ rows, firstColumn }: { rows: ImpactSummary[]; firstColumn: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
            <th className="py-2 pr-3 font-medium">{firstColumn}</th>
            <th className="py-2 px-2 font-medium text-right">Requested</th>
            <th className="py-2 px-2 font-medium text-right">Matched</th>
            <th className="py-2 px-2 font-medium text-right">Completed</th>
            <th className="py-2 px-2 font-medium text-right">Match rate</th>
            <th className="py-2 px-2 font-medium text-right">First offer</th>
            <th className="py-2 px-2 font-medium text-right">To match</th>
            <th className="py-2 pl-2 font-medium text-right">Riders</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-gray-100 last:border-0">
              <td className="py-2 pr-3 text-gray-900">{r.label}</td>
              <td className="py-2 px-2 text-right">{r.requested}</td>
              <td className="py-2 px-2 text-right">{r.matched}</td>
              <td className="py-2 px-2 text-right">{r.completed}</td>
              <td className="py-2 px-2 text-right">{pct(r.matchRate)}</td>
              <td className="py-2 px-2 text-right">{duration(r.medianMinutesToFirstOffer)}</td>
              <td className="py-2 px-2 text-right">{duration(r.medianMinutesToMatch)}</td>
              <td className="py-2 pl-2 text-right">{r.uniqueRiders}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AdminImpactPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const today = todayInAppZone();
  const from = params.from && DATE.test(params.from) ? params.from : addDays(today, -90);
  const to = params.to && DATE.test(params.to) ? params.to : today;

  const report = await getImpactReport(from, to);
  const o = report.overall;

  const cards = [
    { label: "Rides requested", value: o.requested },
    { label: "Rides completed", value: o.completed },
    { label: "Match rate", value: pct(o.matchRate) },
    { label: "Median wait for first offer", value: duration(o.medianMinutesToFirstOffer) },
    { label: "Median time to match", value: duration(o.medianMinutesToMatch) },
    { label: "Riders served", value: o.uniqueRiders },
    { label: "Drivers who gave rides", value: o.uniqueDrivers },
    { label: "Expired without a driver", value: o.expired },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Impact</h2>
        <p className="text-sm text-gray-500 mt-1">
          Outcomes for rides dated in the selected range. Match rate excludes rides the rider cancelled before anyone
          offered. Times are medians from when the request was posted.
        </p>
      </div>

      <Card>
        <form className="flex flex-wrap items-end gap-3" method="get">
          <label className="text-sm">
            <span className="block text-xs text-gray-500 mb-1">From</span>
            <input type="date" name="from" defaultValue={from} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
          </label>
          <label className="text-sm">
            <span className="block text-xs text-gray-500 mb-1">To</span>
            <input type="date" name="to" defaultValue={to} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
          </label>
          <button type="submit" className="px-4 py-1.5 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700">
            Update
          </button>
          <a
            href={`/api/admin/impact-export?from=${from}&to=${to}`}
            className="px-4 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            Download CSV
          </a>
        </form>
        <p className="text-xs text-gray-400 mt-2">The CSV has one row per ride with no names or addresses, so it can be shared with partners and funders.</p>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500">{c.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">By organization</h3>
        <Card padding="lg">
          {report.organizations.length === 0 ? (
            <p className="text-sm text-gray-500">No rides in this range.</p>
          ) : (
            <>
              <SummaryTable rows={report.organizations} firstColumn="Organization (rider's)" />
              <p className="text-xs text-gray-400 mt-3">
                A rider in more than one organization counts toward each, so rows can add up to more than the total.
              </p>
            </>
          )}
        </Card>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">By month</h3>
        <Card padding="lg">
          {report.months.length === 0 ? (
            <p className="text-sm text-gray-500">No rides in this range.</p>
          ) : (
            <SummaryTable rows={report.months} firstColumn="Month" />
          )}
        </Card>
      </div>
    </div>
  );
}
