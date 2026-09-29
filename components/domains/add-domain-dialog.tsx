"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { createDomainAction } from "@/app/(app)/[orgSlug]/domains/actions";
import { FormAlert } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DomainDTO } from "@/lib/dto/domain";
import { RESEND_REGIONS } from "@/lib/resend/types";
import { REGION_LABELS } from "@/lib/validation/domain";
import { DnsRecords } from "./dns-records";

export type ConnectionOption = { id: string; name: string };
export type ProjectOption = { id: string; name: string };

const NO_PROJECT = "none";

/**
 * Step 1: connection, domain name, region (and project). Step 2: the DNS records Resend wants,
 * with copy buttons, because that is the next thing the person has to do.
 */
export function AddDomainDialog({
  orgSlug,
  connections,
  projects,
  projectRequired,
}: {
  orgSlug: string;
  connections: ConnectionOption[];
  projects: ProjectOption[];
  /** Project-scoped members must put a new domain in one of their projects. */
  projectRequired: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [connectionId, setConnectionId] = useState(connections[0]?.id ?? "");
  const [name, setName] = useState("");
  const [region, setRegion] = useState<string>("us-east-1");
  const initialProject = projectRequired ? (projects[0]?.id ?? NO_PROJECT) : NO_PROJECT;
  const [projectId, setProjectId] = useState<string>(initialProject);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<DomainDTO | null>(null);

  function reset() {
    setName("");
    setRegion("us-east-1");
    setProjectId(initialProject);
    setError(null);
    setFields({});
    setCreated(null);
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});
    const result = await createDomainAction(orgSlug, {
      connectionId,
      name,
      region: region as (typeof RESEND_REGIONS)[number],
      projectId: projectId === NO_PROJECT ? null : projectId,
    });
    setPending(false);
    if (!result.ok) {
      const next: Record<string, string> = {};
      for (const [key, messages] of Object.entries(result.error.fieldErrors ?? {})) {
        if (messages[0]) next[key] = messages[0];
      }
      setFields(next);
      if (Object.keys(next).length === 0) setError(result.error.message);
      return;
    }
    setCreated(result.data);
    toast.success(`Added ${result.data.name}`);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="font-bold">
          <Plus aria-hidden /> Add domain
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        {created ? (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle className="text-xl">
                Add these DNS records for {created.name}
              </DialogTitle>
              <DialogDescription>
                Paste them at your DNS provider (where you bought the domain). DNS can take a few
                minutes to hours to spread. Then open the domain and press &ldquo;Verify now&rdquo;.
              </DialogDescription>
            </DialogHeader>
            <DnsRecords records={created.records} />
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Done
              </Button>
              <Button asChild>
                <Link href={`/${orgSlug}/domains/${created.id}`}>Open domain</Link>
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4" noValidate>
            <DialogHeader>
              <DialogTitle className="text-xl">Add a domain</DialogTitle>
              <DialogDescription>
                Wisemail adds it to your Resend account and shows the DNS records to create.
              </DialogDescription>
            </DialogHeader>
            <FormAlert>{error}</FormAlert>

            {connections.length > 1 ? (
              <div className="grid gap-1.5">
                <Label htmlFor="domain-connection">Resend account</Label>
                <Select value={connectionId} onValueChange={setConnectionId}>
                  <SelectTrigger id="domain-connection" className="w-full">
                    <SelectValue placeholder="Choose a connection" />
                  </SelectTrigger>
                  <SelectContent>
                    {connections.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="grid gap-1.5">
              <Label htmlFor="domain-name">Domain</Label>
              <Input
                id="domain-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="mail.example.com"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={!!fields.name}
              />
              {fields.name ? (
                <p role="alert" className="text-xs text-danger-ink">
                  {fields.name}
                </p>
              ) : (
                <p className="text-xs text-ink-muted">
                  A subdomain such as mail.example.com keeps your main domain&apos;s reputation
                  separate.
                </p>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="domain-region">Region</Label>
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger id="domain-region" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESEND_REGIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {REGION_LABELS[r]} · {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-ink-muted">
                Where Resend sends from. Pick the one closest to your recipients. It can&apos;t be
                changed later.
              </p>
            </div>

            {projects.length > 0 ? (
              <div className="grid gap-1.5">
                <Label htmlFor="domain-project">
                  Project{" "}
                  {projectRequired ? null : (
                    <span className="font-normal text-ink-muted">(optional)</span>
                  )}
                </Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger id="domain-project" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {projectRequired ? null : (
                      <SelectItem value={NO_PROJECT}>No project</SelectItem>
                    )}
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fields.projectId ? (
                  <p role="alert" className="text-xs text-danger-ink">
                    {fields.projectId}
                  </p>
                ) : null}
              </div>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !name.trim() || !connectionId}>
                {pending ? "Adding…" : "Add domain"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
