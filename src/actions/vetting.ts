"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser, requireAdmin, requireUser } from "@/lib/auth";
import { withinRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { notifyUser, notifyAdmins } from "@/lib/notify";
import { DRIVER_SCOPES, VETTING_DOC_MAX_BYTES, VETTING_DOC_TYPES } from "@/lib/constants";
import { todayInAppZone } from "@/lib/time";
import { logError } from "@/lib/log";
import { revalidatePath } from "next/cache";

const BUCKET = "vetting-docs";
const RENEWAL_WINDOW_DAYS = 45;

function extensionFor(type: string): string {
  return (
    { "image/jpeg": "jpg", "image/png": "png", "image/heic": "heic", "image/webp": "webp", "application/pdf": "pdf" }[type] ||
    "bin"
  );
}

async function uploadDoc(userId: string, kind: "license" | "insurance", file: File): Promise<string> {
  const path = `${userId}/${kind}-${Date.now()}.${extensionFor(file.type)}`;
  const { error } = await createAdminClient()
    .storage.from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) {
    logError("vetting.upload", error, { kind });
    throw new Error("Couldn't upload your document. Please try again.");
  }
  return path;
}

function validateDoc(file: FormDataEntryValue | null, label: string): File | string {
  if (!(file instanceof File) || file.size === 0) return `Please upload a photo or PDF of your ${label}.`;
  if (file.size > VETTING_DOC_MAX_BYTES) return `Your ${label} file is too large (8 MB max).`;
  if (!VETTING_DOC_TYPES.includes(file.type)) return `Your ${label} must be a photo (JPG, PNG, HEIC) or PDF.`;
  return file;
}

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const ms = new Date(`${date}T12:00:00Z`).getTime() - new Date(`${todayInAppZone()}T12:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * Apply to be an approved driver, or renew documents. New applications
 * wait for review; renewals by approved drivers keep their approval while
 * an admin reviews the new documents.
 */
export async function applyForVetting(formData: FormData) {
  const { user } = await requireActiveUser();
  if (!(await withinRateLimit(user.id, "vetting_application"))) return { error: RATE_LIMIT_MESSAGE };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("vetted_driver_status")
    .select("id, status, license_expires_on, insurance_expires_on")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing?.status === "pending") return { error: "Your application is already under review." };
  if (existing?.status === "suspended") return { error: "Your driver approval is suspended. Please contact an admin." };
  const isRenewal = existing?.status === "approved";
  if (isRenewal) {
    const soonest = Math.min(
      daysUntil(existing.license_expires_on) ?? Infinity,
      daysUntil(existing.insurance_expires_on) ?? Infinity
    );
    if (soonest > RENEWAL_WINDOW_DAYS && Number.isFinite(soonest)) {
      return { error: "Your documents aren't close to expiring yet." };
    }
  }

  if (formData.get("license_attestation") !== "true" || formData.get("insurance_attestation") !== "true") {
    return { error: "You must attest to both requirements." };
  }

  const driverScope = (formData.get("driver_scope") as string) || "";
  if (!DRIVER_SCOPES.some((s) => s.value === driverScope)) return { error: "Please select a driving scope." };

  const licenseExpires = (formData.get("license_expires_on") as string) || "";
  const insuranceExpires = (formData.get("insurance_expires_on") as string) || "";
  const today = todayInAppZone();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(licenseExpires) || licenseExpires <= today) {
    return { error: "Please enter your license's expiration date (it must be in the future)." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(insuranceExpires) || insuranceExpires <= today) {
    return { error: "Please enter your insurance's expiration date (it must be in the future)." };
  }

  const license = validateDoc(formData.get("license_doc"), "driver's license");
  if (typeof license === "string") return { error: license };
  const insurance = validateDoc(formData.get("insurance_doc"), "insurance card");
  if (typeof insurance === "string") return { error: insurance };

  let licensePath: string;
  let insurancePath: string;
  try {
    licensePath = await uploadDoc(user.id, "license", license);
    insurancePath = await uploadDoc(user.id, "insurance", insurance);
  } catch (err) {
    return { error: (err as Error).message };
  }

  const now = new Date().toISOString();
  const fields = {
    license_attestation: true,
    insurance_attestation: true,
    driver_scope: driverScope,
    license_expires_on: licenseExpires,
    insurance_expires_on: insuranceExpires,
    license_doc_path: licensePath,
    insurance_doc_path: insurancePath,
    expiry_warning_sent_at: null,
    reviewed_at: null,
    reviewed_by: null,
    updated_at: now,
    ...(isRenewal ? {} : { status: "pending", admin_notes: null }),
  };

  const { error } = existing
    ? await admin.from("vetted_driver_status").update(fields).eq("id", existing.id)
    : await admin.from("vetted_driver_status").insert({ user_id: user.id, ...fields });
  if (error) return { error: error.message };

  const { data: profile } = await admin.from("users").select("full_name").eq("id", user.id).single();
  await notifyAdmins({
    type: "vetting_submitted",
    title: isRenewal ? "Driver document renewal to review" : "New driver application",
    body: `${profile?.full_name || "A user"} submitted documents for review.`,
    link: "/admin/vetting",
    skipEmail: true,
  });

  revalidatePath("/vetting");
  revalidatePath("/profile");
  return { success: true };
}

export async function getMyVettingStatus() {
  const { supabase, user } = await requireUser();

  const { data } = await supabase
    .from("vetted_driver_status")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return data;
}

// ==================== Admin ====================

/** New applications plus renewals whose new documents need a look. */
export async function getPendingApplications() {
  await requireAdmin();
  const admin = createAdminClient();

  const { data } = await admin
    .from("vetted_driver_status")
    .select(`
      *,
      user:users!user_id(id, full_name, email, phone, avatar_url, role, organization, created_at)
    `)
    .or("status.eq.pending,and(status.eq.approved,reviewed_at.is.null)")
    .order("updated_at", { ascending: true });

  return data || [];
}

/** Short-lived link for an admin to view an uploaded document. */
export async function getVettingDocUrl(path: string) {
  await requireAdmin();
  if (!path || path.includes("..")) return { error: "Invalid document." };
  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  if (error || !data) return { error: "Couldn't open the document." };
  return { url: data.signedUrl };
}

export async function approveDriver(userId: string) {
  const { user: adminUser } = await requireAdmin();
  const admin = createAdminClient();

  const { data: row } = await admin
    .from("vetted_driver_status")
    .select("status")
    .eq("user_id", userId)
    .single();
  const wasRenewal = row?.status === "approved";

  const { error } = await admin
    .from("vetted_driver_status")
    .update({
      status: "approved",
      reviewed_by: adminUser.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) return { error: error.message };

  await notifyUser(userId, {
    type: "vetting_approved",
    title: wasRenewal ? "Your driver documents were renewed" : "You're an approved driver",
    body: wasRenewal
      ? "Thanks for keeping your license and insurance up to date."
      : "An admin approved your application. You'll now see ride requests that match your driving scope.",
    link: "/rides",
    forceEmail: true,
  });

  revalidatePath("/admin/vetting");
  return { success: true };
}

export async function denyDriver(userId: string, notes?: string) {
  const { user: adminUser } = await requireAdmin();
  const admin = createAdminClient();

  const { error } = await admin
    .from("vetted_driver_status")
    .update({
      status: "denied",
      admin_notes: notes || null,
      reviewed_by: adminUser.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) return { error: error.message };

  await notifyUser(userId, {
    type: "vetting_denied",
    title: "Your driver application wasn't approved",
    body: notes ? `Admin note: ${notes}` : "You can update your documents and apply again.",
    link: "/vetting",
    forceEmail: true,
  });

  revalidatePath("/admin/vetting");
  return { success: true };
}
