import { LoginForm } from "@/components/auth/login-form";

const ERRORS: Record<string, string> = {
  link_expired: "That link has expired or was already used. Please try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <LoginForm initialError={error ? ERRORS[error] || null : null} />;
}
