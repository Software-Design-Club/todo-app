import { signOut } from "@/auth";
import { Button } from "@/ui/button";

export function SignOut() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/sign-in" });
      }}
    >
      <Button variant="ghost" type="submit">
        Sign Out
      </Button>
    </form>
  );
}
