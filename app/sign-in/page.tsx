import SignInForm from "@/app/sign-in/_components/sign-in";

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const redirectTo =
    typeof params.redirectTo === "string" ? params.redirectTo : undefined;

  return (
    <div className="flex justify-center items-center h-screen">
      <SignInForm redirectTo={redirectTo} />
    </div>
  );
}
