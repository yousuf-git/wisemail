"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { deleteProjectAction } from "@/app/(app)/[orgSlug]/settings/projects/actions";
import { FormAlert } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProjectDTO } from "@/lib/dto/project";

export function DeleteProjectDialog({
  orgSlug,
  project,
  open,
  onOpenChange,
}: {
  orgSlug: string;
  project: ProjectDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setPending(true);
    setError(null);
    const result = await deleteProjectAction(orgSlug, { projectId: project.id });
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    toast.success(`Deleted “${project.name}”`);
    onOpenChange(false);
    router.refresh();
  }

  const s = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setError(null);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Delete “{project.name}”?</DialogTitle>
          <DialogDescription>
            Its {s(project.domainCount, "domain", "domains")} become unassigned, and existing email
            keeps working. {s(project.scopedMemberCount, "member", "members")} limited to this
            project lose it; anyone left with no projects can see the whole workspace again.
          </DialogDescription>
        </DialogHeader>
        <FormAlert>{error}</FormAlert>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={remove} disabled={pending}>
            {pending ? "Deleting…" : "Delete project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
