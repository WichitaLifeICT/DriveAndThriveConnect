import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await createAdminClient()
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold text-teal-700">Admin Panel</h1>
            <nav className="flex gap-4 text-sm">
              <Link href="/admin" className="text-gray-600 hover:text-gray-900">
                Dashboard
              </Link>
              <Link href="/admin/vetting" className="text-gray-600 hover:text-gray-900">
                Vetting
              </Link>
              <Link href="/admin/users" className="text-gray-600 hover:text-gray-900">
                Users
              </Link>
              <Link href="/admin/organizations" className="text-gray-600 hover:text-gray-900">
                Orgs
              </Link>
              <Link href="/admin/locations" className="text-gray-600 hover:text-gray-900">
                Locations
              </Link>
            </nav>
          </div>
          <Link href="/dashboard" className="text-sm text-teal-600 hover:text-teal-500">
            Back to App
          </Link>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
