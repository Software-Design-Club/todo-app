"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { toast } from "sonner";

import { inviteCollaborator } from "@/app/lists/_actions/invitations";
import type { EmailAddress, List, SentInvitationSummary } from "@/lib/types";

export function InviteByEmailForm({
  listId,
  onSuccess,
}: {
  listId: List["id"];
  onSuccess?: (invitation: SentInvitationSummary) => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = (formData.get("email") as string | null)?.trim();
    if (!email) return;

    startTransition(async () => {
      try {
        const result = await inviteCollaborator({
          listId,
          invitedEmail: email as EmailAddress,
        });

        if (result.kind === "success") {
          toast.success(`Invitation sent to ${email}`);
          if (onSuccess) {
            onSuccess(result.invitation);
          } else {
            router.refresh();
          }
        } else {
          toast.error(result.errorMessage);
        }
        formRef.current?.reset();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to send invitation.",
        );
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex gap-2 mt-2">
      <input
        type="email"
        name="email"
        placeholder="Invite by email"
        required
        disabled={isPending}
        className="border border-gray-300 p-2 rounded-md text-sm flex-grow focus:ring-2 focus:ring-blue-500 outline-none dark:bg-gray-700 dark:border-gray-600 dark:text-white"
      />
      <button
        type="submit"
        disabled={isPending}
        className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-2 rounded-md disabled:opacity-50"
      >
        {isPending ? "Sending..." : "Send Invite"}
      </button>
    </form>
  );
}
