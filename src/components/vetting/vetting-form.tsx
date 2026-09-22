"use client";

import { useState } from "react";
import { applyForVetting } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DRIVER_SCOPES } from "@/lib/constants";
import { useRouter } from "next/navigation";

export function VettingForm() {
  const router = useRouter();
  const [licenseChecked, setLicenseChecked] = useState(false);
  const [insuranceChecked, setInsuranceChecked] = useState(false);
  const [driverScope, setDriverScope] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    if (!licenseChecked || !insuranceChecked) {
      setError("You must attest to both requirements.");
      return;
    }
    if (!driverScope) {
      setError("Please select a driving scope.");
      return;
    }
    setLoading(true);
    setError(null);
    formData.set("license_attestation", "true");
    formData.set("insurance_attestation", "true");
    formData.set("driver_scope", driverScope);
    const result = await applyForVetting(formData);
    if (result?.error) {
      setError(result.error);
    } else {
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <Card padding="lg">
      <h3 className="font-medium text-gray-900 mb-4">Apply for Vetting</h3>

      <p className="text-sm text-gray-600 mb-4">
        To become a vetted driver, please confirm the following and select your driving scope:
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <form action={handleSubmit} className="space-y-4">
        <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
          <input
            type="checkbox"
            checked={licenseChecked}
            onChange={(e) => setLicenseChecked(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
          />
          <div>
            <p className="text-sm font-medium text-gray-900">Valid Driver&apos;s License</p>
            <p className="text-xs text-gray-500">
              I attest that I hold a valid, non-suspended driver&apos;s license.
            </p>
          </div>
        </label>

        <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
          <input
            type="checkbox"
            checked={insuranceChecked}
            onChange={(e) => setInsuranceChecked(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
          />
          <div>
            <p className="text-sm font-medium text-gray-900">Valid Auto Insurance</p>
            <p className="text-xs text-gray-500">
              I attest that I carry valid auto insurance as required by law.
            </p>
          </div>
        </label>

        {/* Driver Scope Selection */}
        <div>
          <p className="text-sm font-medium text-gray-900 mb-2">Driving Scope</p>
          <p className="text-xs text-gray-500 mb-3">
            Choose who you&apos;d like to drive for:
          </p>
          <div className="space-y-2">
            {DRIVER_SCOPES.map((scope) => (
              <label
                key={scope.value}
                className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors ${
                  driverScope === scope.value
                    ? "border-teal-500 bg-teal-50 ring-1 ring-teal-500"
                    : "border-gray-200"
                }`}
              >
                <input
                  type="radio"
                  name="driver_scope"
                  value={scope.value}
                  checked={driverScope === scope.value}
                  onChange={(e) => setDriverScope(e.target.value)}
                  className="mt-0.5 h-4 w-4 border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">{scope.label}</p>
                  <p className="text-xs text-gray-500">{scope.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <p className="text-xs text-gray-400">
          By submitting, you affirm the above attestations are true. Future phases may require
          document verification.
        </p>

        <Button
          type="submit"
          className="w-full"
          loading={loading}
          disabled={!licenseChecked || !insuranceChecked || !driverScope}
        >
          Submit Application
        </Button>
      </form>
    </Card>
  );
}
