import SignInForm from "@/app/sign-in/_components/sign-in";
import { sanitizeRedirectTarget } from "@/lib/validation";

interface SignInPageProps {
  searchParams: Promise<{
    redirectTo?: string;
  }>;
}

export default async function SignIn({ searchParams }: SignInPageProps) {
  const { redirectTo } = await searchParams;

  return (
    <div className="flex justify-center items-center h-screen">
      <SignInForm redirectTo={sanitizeRedirectTarget(redirectTo)} />
    </div>
  );
}
