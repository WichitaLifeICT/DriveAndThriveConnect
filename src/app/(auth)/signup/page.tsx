import { SignupForm } from "@/components/auth/signup-form";
import { getActiveOrganizations } from "@/actions/organizations";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const organizations = await getActiveOrganizations();
  return <SignupForm organizations={organizations} />;
}
