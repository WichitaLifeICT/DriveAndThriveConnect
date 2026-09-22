"use client";

import { useState } from "react";
import { signUpWithEmail, signInWithGoogle } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { DISCLAIMER_TEXT, ORGANIZATIONS } from "@/lib/constants";
import Link from "next/link";

interface SignupFormProps {
  inviteToken?: string;
  inviterName?: string;
}

export function SignupForm({ inviteToken, inviterName }: SignupFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [selectedOrgs, setSelectedOrgs] = useState<string[]>([]);
  const [isNone, setIsNone] = useState(false);
  const [otherOrg, setOtherOrg] = useState("");
  const [showOther, setShowOther] = useState(false);

  function getOrgValue() {
    if (isNone) return "none";
    const orgs = [...selectedOrgs];
    if (showOther && otherOrg.trim()) orgs.push(`other: ${otherOrg.trim()}`);
    return orgs.join(",") || "";
  }

  function toggleOrg(org: string) {
    setIsNone(false);
    setSelectedOrgs((prev) =>
      prev.includes(org) ? prev.filter((o) => o !== org) : [...prev, org]
    );
  }

  async function handleSubmit(formData: FormData) {
    if (!disclaimerAccepted) {
      setError("You must accept the platform disclaimer to create an account.");
      return;
    }
    const orgVal = getOrgValue();
    if (!orgVal && !isNone) {
      setError("Please select at least one organization or None.");
      return;
    }
    setLoading(true);
    setError(null);
    if (inviteToken) {
      formData.set("invite_token", inviteToken);
    }
    formData.set("organization", orgVal);
    const result = await signUpWithEmail(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  async function handleGoogleSignup() {
    if (!disclaimerAccepted) {
      setError("You must accept the platform disclaimer to create an account.");
      return;
    }
    const orgVal = getOrgValue();
    if (!orgVal && !isNone) {
      setError("Please select at least one organization or None.");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await signInWithGoogle(inviteToken, orgVal);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <Card padding="lg">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">Create your account</h2>

      {inviterName && (
        <div className="mb-4 p-3 bg-teal-50 border border-teal-200 rounded-lg text-sm text-teal-800">
          You&apos;ve been invited by <strong>{inviterName}</strong>. You&apos;ll be automatically connected after signing up.
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <form action={handleSubmit} className="space-y-4">
        <Input
          id="full_name"
          name="full_name"
          type="text"
          label="Full name"
          placeholder="Your name"
          required
        />
        <Input
          id="email"
          name="email"
          type="email"
          label="Email"
          placeholder="you@example.com"
          required
        />
        <Input
          id="password"
          name="password"
          type="password"
          label="Password"
          placeholder="At least 6 characters"
          minLength={6}
          required
        />
        <Input
          id="phone"
          name="phone"
          type="tel"
          label="Phone number"
          placeholder="(316) 555-1234"
        />

        {/* Organization Selection (multi-select) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Organization(s)
          </label>
          <p className="text-xs text-gray-500 mb-2">Select all that apply</p>
          <div className="space-y-1.5">
            {ORGANIZATIONS.map((org) => (
              <label
                key={org}
                className={`flex items-center gap-2.5 p-2.5 border rounded-lg cursor-pointer transition-colors ${
                  selectedOrgs.includes(org) ? "border-teal-500 bg-teal-50" : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedOrgs.includes(org)}
                  onChange={() => toggleOrg(org)}
                  className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm text-gray-900">{org}</span>
              </label>
            ))}
            <label
              className={`flex items-center gap-2.5 p-2.5 border rounded-lg cursor-pointer transition-colors ${
                isNone ? "border-teal-500 bg-teal-50" : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <input
                type="checkbox"
                checked={isNone}
                onChange={() => {
                  setIsNone(!isNone);
                  if (!isNone) {
                    setSelectedOrgs([]);
                    setShowOther(false);
                  }
                }}
                className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm text-gray-900">None</span>
            </label>
            <label
              className={`flex items-center gap-2.5 p-2.5 border rounded-lg cursor-pointer transition-colors ${
                showOther ? "border-teal-500 bg-teal-50" : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <input
                type="checkbox"
                checked={showOther}
                onChange={() => {
                  setShowOther(!showOther);
                  if (!showOther) setIsNone(false);
                }}
                className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm text-gray-900">Other</span>
            </label>
          </div>
        </div>

        {showOther && (
          <Input
            id="other_org"
            name="other_org"
            type="text"
            label="Organization name"
            placeholder="Enter your organization name"
            value={otherOrg}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOtherOrg(e.target.value)}
            required
          />
        )}

        {/* Disclaimer */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-2">Platform Disclaimer</h3>
          <div className="text-xs text-gray-600 whitespace-pre-line mb-3 max-h-32 overflow-y-auto">
            {DISCLAIMER_TEXT}
          </div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={disclaimerAccepted}
              onChange={(e) => setDisclaimerAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
            <span className="text-sm text-gray-700">
              I have read and agree to the platform disclaimer
            </span>
          </label>
        </div>

        <Button type="submit" className="w-full" loading={loading} disabled={!disclaimerAccepted}>
          Create account
        </Button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-white text-gray-500">or</span>
        </div>
      </div>

      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={handleGoogleSignup}
        disabled={loading || !disclaimerAccepted}
      >
        <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
        Continue with Google
      </Button>

      <p className="mt-6 text-center text-sm text-gray-600">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-teal-600 hover:text-teal-500">
          Log in
        </Link>
      </p>
    </Card>
  );
}
