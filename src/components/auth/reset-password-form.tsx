"use client";

import { useState } from "react";
import Link from "next/link";
import { updatePassword } from "@/actions/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export function ResetPasswordForm() {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await updatePassword(formData);
    setLoading(false);
    if (result?.error) setError(result.error);
    else setDone(true);
  }

  return (
    <Card padding="lg">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Choose a new password</h2>
      {done ? (
        <div className="text-center">
          <p className="text-sm text-gray-600 mb-4">Your password has been updated.</p>
          <Link href="/dashboard" className="font-medium text-teal-600 hover:text-teal-500">
            Continue to the app
          </Link>
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}
          <form action={handleSubmit} className="space-y-4">
            <Input
              id="password"
              name="password"
              type="password"
              label="New password"
              placeholder="At least 8 characters"
              minLength={8}
              autoComplete="new-password"
              required
            />
            <Input
              id="confirm_password"
              name="confirm_password"
              type="password"
              label="Confirm new password"
              minLength={8}
              autoComplete="new-password"
              required
            />
            <Button type="submit" className="w-full" loading={loading}>
              Save password
            </Button>
          </form>
        </>
      )}
    </Card>
  );
}
