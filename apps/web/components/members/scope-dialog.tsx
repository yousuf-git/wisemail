"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { setMemberScopeAction } from "@/app/(app)/[orgSlug]/settings/members/actions";
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
import type { MemberDTO } from "@/lib/dto/member";
import type { ProjectDTO } from "@/lib/dto/project";
import { ProjectChecklist } from "./project-checklist";

export function ScopeDialog({
  orgSlug,
  member,
  projects,
  open,
  onOpenChange,
}: {
  orgSlug: string;
  member: MemberDTO;
  projects: Pick<ProjectDTO, "id" | "name" | "color">[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState<string[]>(member.projectIds ?? []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setError(null);
    const result = await setMemberScopeAction(orgSlug, { memberId: member.id, projectIds: value });
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    toast.success(value.length === 0 ? "Access is workspace-wide" : "Project access saved");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Project access for {member.name}</DialogTitle>
          <DialogDescription>
            Limited members only see data from the projects you check. Uncheck everything to give
            access to the whole workspace.
          </DialogDescription>
        </DialogHeader>
        <FormAlert>{error}</FormAlert>
        {projects.length === 0 ? (
          <p className="text-sm text-ink-muted">Create a project first, then limit access to it.</p>
        ) : (
          <ProjectChecklist
            name={`scope-${member.id}`}
            projects={projects}
            value={value}
            onChange={setValue}
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending} className="font-bold">
            {pending ? "Saving…" : "Save access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
