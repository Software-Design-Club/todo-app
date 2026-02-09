import { signIn } from "@/auth";
import { Button } from "@/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/ui/card";

interface SignInFormProps {
  redirectTo: string;
}

export default function SignInForm({ redirectTo = "/" }: SignInFormProps) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">Sign In</CardTitle>
        <CardDescription>Sign in with your GitHub account.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <form
            action={async () => {
              "use server";
              await signIn("github", { redirectTo });
            }}
          >
            <Button variant="outline" size="sm" type="submit">
              Sign in with GitHub
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
