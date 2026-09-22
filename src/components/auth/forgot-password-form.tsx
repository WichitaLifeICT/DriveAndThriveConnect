"use client";

import { useState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/actions/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export function ForgotPasswordForm() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await requestPasswordReset(formData);
    setLoading(false);
    if (result?.error) setError(result.error);
    else setSent(true);
  }

  return (
    <Card padding="lg">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">Reset your password</h2>
      {sent ? (
        <p className="text-sm text-gray-600">
          If an account exists for that email, we sent a link to reset your password. It may take a few minutes — check
          your spam folder too.
        </p>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-4">Enter your email and we&apos;ll send you a reset link.</p>
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}
          <form action={handleSubmit} className="space-y-4">
            <Input id="email" name="email" type="email" label="Email" placeholder="you@example.com" required />
            <Button type="submit" className="w-full" loading={loading}>
              Send reset link
            </Button>
          </form>
        </>
      )}
      <p className="mt-6 text-center text-sm text-gray-600">
        <Link href="/login" className="font-medium text-teal-600 hover:text-teal-500">
          Back to log in
        </Link>
      </p>
    </Card>
  );
}
