# Email Invitation Runbook

## Release Gate

Use a single command before deployment:

```bash
npm run verify:all
```

This command runs:
1. `npm run verify:env`
2. `npm run typecheck`
3. `npm run lint`
4. `npm run test:unit`
5. `npm run test:integration`
6. `npm run test:e2e:smoke`

## Required Environment Variables

- `RESEND_API_KEY`
- `EMAIL_FROM`
- `APP_BASE_URL`

Optional:
- `RESEND_WEBHOOK_SECRET` (recommended in production)

Validate your configuration with:

```bash
npm run verify:env
```

## Migration and Backfill Order

Apply schema migrations first:

```bash
npx drizzle-kit push
```

Then run collaborator backfill to enforce owner rows and invitation acceptance defaults:

```bash
node drizzle/backfillListCollaborators.ts
```

## Troubleshooting

### `verify:env` fails
- Check for missing or empty required vars.
- Ensure `APP_BASE_URL` is an absolute URL (`http://localhost:3000`).

### Invitation email send fails
- Confirm `RESEND_API_KEY` and `EMAIL_FROM` values.
- Check invitation rows for `emailDeliveryStatus`, `emailDeliveryError`, and `emailDeliveryProviderId`.

### Webhook events rejected
- Verify `RESEND_WEBHOOK_SECRET`.
- Confirm sender signature header matches your configured verification logic.

### Invite link invalid/expired unexpectedly
- Check `inviteStatus`, `inviteExpiresAt`, and `inviteTokenHash` in `list_collaborators`.
- Resend invitation to rotate token and generate a fresh acceptance URL.
