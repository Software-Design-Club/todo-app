import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { AbsoluteInvitationUrl, InvitationId } from "@/lib/types";

import type { EmailService, EmailServiceSendResponse } from "./service";

export type StubInvitationDelivery = {
  invitationId: number;
  acceptanceUrl: string;
  createdAt: string;
};

const defaultMailboxPath = path.join(
  os.tmpdir(),
  "todo-app-invitation-mailbox.json",
);

function resolveMailboxPath() {
  return (
    process.env.INVITATION_STUB_MAILBOX_PATH?.trim() || defaultMailboxPath
  );
}

async function readDeliveries(): Promise<StubInvitationDelivery[]> {
  try {
    const raw = await readFile(resolveMailboxPath(), "utf8");
    return JSON.parse(raw) as StubInvitationDelivery[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function writeDeliveries(deliveries: StubInvitationDelivery[]) {
  const mailboxPath = resolveMailboxPath();
  await mkdir(path.dirname(mailboxPath), { recursive: true });
  await writeFile(mailboxPath, JSON.stringify(deliveries, null, 2), "utf8");
}

export async function resetStubInvitationMailbox() {
  await writeDeliveries([]);
}

export async function listStubInvitationDeliveries() {
  return readDeliveries();
}

export function createTestStubEmailService(): EmailService {
  return {
    async sendInvitationEmail(input: {
      invitationId: InvitationId;
      acceptanceUrl: AbsoluteInvitationUrl;
    }): Promise<EmailServiceSendResponse> {
      const deliveries = await readDeliveries();

      deliveries.push({
        invitationId: Number(input.invitationId),
        acceptanceUrl: input.acceptanceUrl,
        createdAt: new Date().toISOString(),
      });

      await writeDeliveries(deliveries);

      return {
        kind: "accepted",
        providerMessageId: `test-stub-${Number(input.invitationId)}` as never,
      };
    },
  };
}
