# Email Invitations Runbook

## Required Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `RESEND_API_KEY` | Yes | API key for Resend email delivery service |
| `EMAIL_FROM` | Yes | Verified sender email address (must be a valid email) |
| `APP_BASE_URL` | Yes | Application base URL used to construct invitation acceptance links (http or https) |
| `RESEND_WEBHOOK_SECRET` | No | Webhook signing secret for verifying Resend delivery event callbacks |

All required variables are validated at runtime by `verifyInvitationEnv()`. The application will throw on missing or malformed values with the name of the offending key.

## Schema Migration Order

Apply migrations in this order:

1. `invitations` table with all columns and constraints
2. Indexes: `invitations_list_id_status_idx`, `invitations_secret_hash_idx`, `invitations_list_email_status_idx`
3. Unique partial index: `invitations_open_email_unique_idx` (enforces single open invite per list+email)
4. Check constraints: `invitations_open_requires_core_fields`, `invitations_pending_approval_requires_acceptor`, `invitations_accepted_requires_acceptor_and_resolved_at`, `invitations_terminal_requires_resolved_at`, `invitations_accepted_by_email_tracks_mismatch`

Run migrations with: `npx drizzle-kit push`

## Backfill Order

If migrating from a system where invitations were stored as `list_collaborators` rows:

1. Run the schema migration to create the `invitations` table
2. Run the backfill script to copy legacy invitation records into `invitations`
3. Verify backfilled rows satisfy all check constraints
4. Do not remove legacy `list_collaborators` rows -- accepted collaborators must persist

## Rollback Switch

To disable email invitations without a code deploy:

1. Unset or clear the `RESEND_API_KEY` environment variable
2. The `verifyInvitationEnv()` call will throw, preventing any new invitation workflows from executing
3. Existing open invitations remain in the database but cannot generate new emails
4. To fully revoke all open invitations, run `invalidateOpenInvitesForList` for each affected list, or execute:
   ```sql
   UPDATE invitations
   SET status = 'revoked', "resolvedAt" = now(), "updatedAt" = now()
   WHERE status IN ('pending', 'sent');
   ```

## Email Delivery Troubleshooting

### Invitation email not received

1. Check the `invitations` table for the row: is `status` = `sent`?
2. Check `providerMessageId` -- if null, the email was never submitted to Resend
3. Check `lastDeliveryError` for immediate rejection details
4. Check `deliveryEventType` for async delivery failures (bounced, failed, delayed, complained)
5. Verify `RESEND_API_KEY` is valid and the sending domain is verified in Resend
6. Verify `EMAIL_FROM` matches a verified domain

### Invitation link not working

1. Verify `APP_BASE_URL` matches the deployed application URL
2. Check the invitation row: is `status` still `sent` or `pending`? If `revoked` or `expired`, the link is invalid
3. Check `expiresAt` -- invitations expire after 7 days
4. If the secret was rotated (a second invite was sent to the same email for the same list), only the latest link is valid

### Invitations not invalidated on archive/delete

1. Both `archiveList` and `deleteList` use database transactions to invalidate open invitations before the lifecycle change
2. Check for transaction failures in application logs
3. On delete, invitation rows are cascade-deleted; on archive, they are set to `revoked`

## Verification

Run the full verification suite before release:

```bash
npm run verify:all
```

This executes: environment verification, typecheck, lint, unit tests, integration tests, and e2e smoke tests.
