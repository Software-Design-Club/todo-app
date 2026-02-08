import SignInForm from "@/app/sign-in/_components/sign-in";

interface SignInPageProps {
  searchParams: Promise<{
    redirectTo?: string;
  }>;
}

function sanitizeRedirectTarget(redirectTo?: string): string {
  if (!redirectTo) {
    return "/";
  }

  // Prevent open redirects by allowing app-relative paths only.
  if (!redirectTo.startsWith("/")) {
    return "/";
  }

  return redirectTo;
}

export default async function SignIn({ searchParams }: SignInPageProps) {
  const { redirectTo } = await searchParams;

  return (
    <div className="flex justify-center items-center h-screen">
      <SignInForm redirectTo={sanitizeRedirectTarget(redirectTo)} />
    </div>
  );
}
