"use client";

import { useState } from "react";
import { Button } from "@/ui/button";
import { Copy, Check } from "lucide-react";
import type { List } from "@/lib/types";

interface ShareLinkButtonProps {
  listId: List["id"];
}

export function ShareLinkButton({ listId }: ShareLinkButtonProps) {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    const shareUrl = `${window.location.origin}/lists/${listId}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setIsCopied(true);

      setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    } catch (error) {
      console.error("Failed to copy link:", error);
    }
  };

  return (
    <Button
      onClick={handleCopy}
      variant="outline"
      size="sm"
      disabled={isCopied}
      className="flex items-center gap-2"
    >
      {isCopied ? (
        <>
          <Check className="h-4 w-4" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-4 w-4" />
          Copy Link
        </>
      )}
    </Button>
  );
}
