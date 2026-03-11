"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  copyInvitationLink,
  resendInvitation,
} from "@/app/lists/_actions/invitations";
import type { InvitationId } from "@/lib/types";

export function SentInvitationActions({
  invitationId,
}: {
  invitationId: InvitationId;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isCopied, setIsCopied] = useState(false);

  function handleResend() {
    startTransition(async () => {
      try {
        await resendInvitation({ invitationId });
        router.refresh();
        toast.success("Invitation resent.");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to resend invitation.",
        );
      }
    });
  }

  function handleCopyLink() {
    startTransition(async () => {
      try {
        const { acceptanceUrl } = await copyInvitationLink({
          invitationId,
        });

        await navigator.clipboard.writeText(acceptanceUrl);
        setIsCopied(true);
        toast.success("Invitation link copied.");

        setTimeout(() => {
          setIsCopied(false);
        }, 2000);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to copy invitation link.",
        );
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleResend}
        disabled={isPending}
        className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded disabled:opacity-50"
      >
        {isPending ? "Working..." : "Resend"}
      </button>
      <button
        type="button"
        onClick={handleCopyLink}
        disabled={isPending}
        className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 px-2 py-1 rounded disabled:opacity-50"
      >
        {isCopied ? "Copied" : "Copy Link"}
      </button>
    </>
  );
}
