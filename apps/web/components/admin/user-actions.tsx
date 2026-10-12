"use client";

import {
  banUserAction,
  impersonateAction,
  resendVerificationAction,
  revokeSessionsAction,
  unbanUserAction,
} from "@/app/(admin)/admin/actions";
import { ActionForm, Disclosure, TextField } from "./action-form";

export type UserActionsProps = {
  userId: string;
  banned: boolean;
  isAdmin: boolean;
  isSelf: boolean;
  emailVerified: boolean;
};

const reasonOf = (f: FormData) => String(f.get("reason") ?? "");

/** Support actions for one user. Every submit is written to the audit log with the reason. */
export function UserActions({ userId, banned, isAdmin, isSelf, emailVerified }: UserActionsProps) {
  const locked = isAdmin || isSelf;
  return (
    <div className="grid gap-3">
      {!emailVerified ? (
        <ActionForm
          action={resendVerificationAction}
          build={() => ({ userId })}
          submit="Resend verification email"
          success="Verification email sent"
          variant="outline"
        />
      ) : null}

      {locked ? (
        <p className="text-sm text-ink-muted">
          {isSelf
            ? "This is you."
            : "Platform admins can't be banned, signed out or impersonated here."}
        </p>
      ) : (
        <>
          <Disclosure summary="Impersonate for support">
            <p className="mb-3 text-sm text-ink-muted">
              You will see Wisemail as this user for one hour, with a banner to stop. Start and stop
              are recorded in the audit log of the user and of each of their workspaces.
            </p>
            <ActionForm
              action={impersonateAction}
              build={(f) => ({ userId, reason: reasonOf(f) })}
              submit="Start impersonating"
              success="Impersonating"
              reset={false}
              onDone={(data) => window.location.assign(data.path)}
            >
              <TextField
                label="Reason"
                name="reason"
                required
                multiline
                placeholder="Ticket or customer request"
              />
            </ActionForm>
          </Disclosure>

          {banned ? (
            <Disclosure summary="Unban">
              <ActionForm
                action={unbanUserAction}
                build={(f) => ({ userId, reason: reasonOf(f) || undefined })}
                submit="Unban user"
                success="User unbanned"
              >
                <TextField label="Reason (optional)" name="reason" />
              </ActionForm>
            </Disclosure>
          ) : (
            <Disclosure summary="Ban user" tone="danger">
              <ActionForm
                action={banUserAction}
                build={(f) => {
                  const days = Number(f.get("days"));
                  return { userId, reason: reasonOf(f), ...(days ? { expiresInDays: days } : {}) };
                }}
                submit="Ban user"
                success="User banned"
                variant="destructive"
              >
                <p className="text-sm text-ink-muted">
                  Signs them out everywhere and blocks sign-in. Their workspaces and data are
                  untouched.
                </p>
                <TextField label="Reason" name="reason" required multiline />
                <TextField
                  label="Ban length in days"
                  name="days"
                  type="number"
                  min={1}
                  max={3650}
                  hint="Leave empty for no expiry."
                />
              </ActionForm>
            </Disclosure>
          )}

          <Disclosure summary="Revoke all sessions" tone="danger">
            <ActionForm
              action={revokeSessionsAction}
              build={(f) => ({ userId, reason: reasonOf(f) })}
              submit="Revoke sessions"
              success="Sessions revoked"
              variant="destructive"
            >
              <TextField label="Reason" name="reason" required multiline />
            </ActionForm>
          </Disclosure>
        </>
      )}
    </div>
  );
}
