"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";
import { appUrl } from "@/lib/app-url";
import { logError } from "@/lib/log";
import { notifyUser } from "@/lib/notify";
import { formatClockTime, formatLongDate } from "@/lib/time";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/** Email a password reset link. Always reports success (no account probing). */
export async function requestPasswordReset(formData: FormData) {
  const email = ((formData.get("email") as string) || "").trim();
  if (!email) return { error: "Please enter your email." };

  const supabase = await createServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: appUrl("/auth/callback?next=/reset-password"),
  });
  if (error) logError("password-reset.request", error);

  return { success: true };
}

/** Set a new password (the reset link signs the user in first). */
export async function updatePassword(formData: FormData) {
  const { supabase } = await requireUser();
  const password = (formData.get("password") as string) || "";
  const confirm = (formData.get("confirm_password") as string) || "";

  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password !== confirm) return { error: "Passwords don't match." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  return { success: true };
}

/**
 * Permanently delete the signed-in user's account and their data.
 * Requires typing DELETE to confirm.
 */
export async function deleteMyAccount(formData: FormData) {
  const { supabase, user } = await requireUser();
  if (((formData.get("confirm") as string) || "").trim() !== "DELETE") {
    return { error: 'Type DELETE to confirm.' };
  }

  const admin = createAdminClient();

  const now = new Date().toISOString();

  // As a rider: tell matched drivers their ride is off (the rides
  // themselves are deleted with the account)
  const { data: myMatched } = await admin
    .from("ride_requests")
    .select("id, ride_date, ride_time, matched_offer_id")
    .eq("rider_id", user.id)
    .eq("status", "matched");
  for (const ride of myMatched || []) {
    if (!ride.matched_offer_id) continue;
    const { data: offer } = await admin.from("ride_offers").select("driver_id").eq("id", ride.matched_offer_id).single();
    await notifyUser(offer?.driver_id, {
      type: "ride_cancelled",
      title: "A ride you were driving was cancelled",
      body: `The rider closed their account, so the ride on ${formatLongDate(ride.ride_date)} at ${formatClockTime(ride.ride_time)} is cancelled.`,
      forceEmail: true,
    });
  }

  // As a driver: reopen rides I was matched to so riders aren't stranded
  const { data: myAccepted } = await admin
    .from("ride_offers")
    .select("ride_request_id")
    .eq("driver_id", user.id)
    .eq("status", "accepted");
  const acceptedRideIds = (myAccepted || []).map((o) => o.ride_request_id);
  if (acceptedRideIds.length > 0) {
    const { data: reopened } = await admin
      .from("ride_requests")
      .update({ status: "open", matched_offer_id: null, matched_at: null, picked_up_at: null, updated_at: now })
      .in("id", acceptedRideIds)
      .eq("status", "matched")
      .select("id, rider_id, ride_date, ride_time");
    for (const ride of reopened || []) {
      await notifyUser(ride.rider_id, {
        type: "driver_backed_out",
        title: "Your driver is no longer available",
        body: `Your driver closed their account. Your ride on ${formatLongDate(ride.ride_date)} at ${formatClockTime(ride.ride_time)} is open again.`,
        link: `/rides/${ride.id}`,
        forceEmail: true,
      });
    }
  }

  // Remove uploaded vetting documents
  const { data: files } = await admin.storage.from("vetting-docs").list(user.id);
  if (files && files.length > 0) {
    await admin.storage.from("vetting-docs").remove(files.map((f) => `${user.id}/${f.name}`));
  }

  // Deleting the auth user cascades to the profile and everything owned by it
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    logError("account.delete", error);
    return { error: "We couldn't delete your account. Please contact an admin." };
  }

  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/?account_deleted=1");
}
