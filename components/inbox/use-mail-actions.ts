"use client";

import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";

import type { MailListRowDTO, Page, ThreadDetailDTO } from "@/lib/dto/mail";
import {
  markThreadReadAction,
  markThreadUnreadAction,
  restoreItemsAction,
  trashItemsAction,
} from "@/app/(app)/[orgSlug]/inbox/actions";
import { threadKey } from "./api";

type Rows = InfiniteData<Page<MailListRowDTO>, string | null>;

export type TrashTarget = { threadIds?: string[]; emailIds?: string[] };

/**
 * Mutations for the inbox with optimistic cache updates. Lists live under `["threads", org, ...]`,
 * conversations under `["thread", org, id]`; every write patches both and falls back to a refetch
 * when the server refuses.
 */
export function useMailActions(orgSlug: string) {
  const queryClient = useQueryClient();

  const patchRows = useCallback(
    (fn: (rows: MailListRowDTO[]) => MailListRowDTO[]) => {
      queryClient.setQueriesData<Rows>({ queryKey: ["threads", orgSlug] }, (data) =>
        data
          ? { ...data, pages: data.pages.map((page) => ({ ...page, items: fn(page.items) })) }
          : data,
      );
    },
    [queryClient, orgSlug],
  );

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["threads", orgSlug] }),
    [queryClient, orgSlug],
  );

  const setUnread = useCallback(
    async (threadId: string, unread: boolean) => {
      patchRows((rows) => rows.map((r) => (r.threadId === threadId ? { ...r, unread } : r)));
      queryClient.setQueryData<ThreadDetailDTO>(threadKey(orgSlug, threadId), (d) =>
        d ? { ...d, unread } : d,
      );
      const result = await (unread ? markThreadUnreadAction : markThreadReadAction)(orgSlug, {
        threadId,
      });
      if (!result.ok) {
        toast.error(result.error.message);
        void refresh();
        void queryClient.invalidateQueries({ queryKey: threadKey(orgSlug, threadId) });
      }
      return result.ok;
    },
    [orgSlug, patchRows, queryClient, refresh],
  );

  const restore = useCallback(
    async (target: TrashTarget, options: { quiet?: boolean } = {}) => {
      const result = await restoreItemsAction(orgSlug, target);
      if (!result.ok) {
        toast.error(result.error.message);
        return false;
      }
      if (!options.quiet) toast.success("Restored");
      void refresh();
      return true;
    },
    [orgSlug, refresh],
  );

  const trash = useCallback(
    async (target: TrashTarget) => {
      const threadIds = new Set(target.threadIds);
      const emailIds = new Set(target.emailIds);
      patchRows((rows) =>
        rows.filter((r) =>
          r.kind === "email"
            ? !emailIds.has(r.id)
            : !threadIds.has(r.id) && !(r.threadId && threadIds.has(r.threadId)),
        ),
      );
      const result = await trashItemsAction(orgSlug, target);
      if (!result.ok) {
        toast.error(result.error.message);
        void refresh();
        return false;
      }
      toast("Moved to Trash", {
        duration: 5000,
        action: { label: "Undo", onClick: () => void restore(target, { quiet: true }) },
      });
      void refresh();
      return true;
    },
    [orgSlug, patchRows, refresh, restore],
  );

  return useMemo(
    () => ({
      markRead: (threadId: string) => setUnread(threadId, false),
      markUnread: (threadId: string) => setUnread(threadId, true),
      trash,
      restore,
    }),
    [setUnread, trash, restore],
  );
}
