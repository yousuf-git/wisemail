"use client";

import { MoreHorizontal, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  createPropertyAction,
  deletePropertyAction,
  updatePropertyAction,
} from "@/app/(app)/[orgSlug]/audience/actions";
import { EmptyState } from "@/components/app/empty-state";
import { LiveRefresh } from "@/components/app/live-refresh";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ConnectionOptionDTO, PropertyDTO } from "@/lib/dto/audience";
import { PROPERTY_KEY } from "@/lib/validation/audience";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";
import { ConnectionSelect, firstWritable } from "./connection-select";
import { audienceError, fieldErrorMap } from "./errors";

function PropertyDialog({
  orgSlug,
  connections,
  property,
  onOpenChange,
}: {
  orgSlug: string;
  connections: ConnectionOptionDTO[];
  property?: PropertyDTO;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [connectionId, setConnectionId] = useState(firstWritable(connections));
  const [key, setKey] = useState(property?.key ?? "");
  const [type, setType] = useState<"string" | "number">(property?.type ?? "string");
  const [fallback, setFallback] = useState(
    property?.fallbackValue === null || property === undefined
      ? ""
      : String(property.fallbackValue),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    const trimmed = fallback.trim();
    if (type === "number" && trimmed && !Number.isFinite(Number(trimmed)))
      return setErrors({ fallbackValue: "Use a number." });
    if (!property && !PROPERTY_KEY.test(key.trim().toLowerCase())) {
      return setErrors({
        key: "Use lowercase letters, numbers and underscores, starting with a letter.",
      });
    }
    setErrors({});
    const value = trimmed === "" ? null : type === "number" ? Number(trimmed) : trimmed;
    setBusy(true);
    const result = property
      ? await updatePropertyAction(orgSlug, { id: property.id, fallbackValue: value })
      : await createPropertyAction(orgSlug, { connectionId, key, type, fallbackValue: value });
    setBusy(false);
    if (!result.ok) {
      const fields = fieldErrorMap(result.error.fieldErrors);
      setErrors(fields);
      if (!Object.keys(fields).length || result.error.code !== "validation")
        setFormError(audienceError(result.error));
      return;
    }
    toast.success(property ? "Property saved" : `Created ${result.data.key}`);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle className="text-xl">
              {property ? `Edit ${property.key}` : "New property"}
            </DialogTitle>
            <DialogDescription>
              Properties are extra fields on every contact, like company or plan.
            </DialogDescription>
          </DialogHeader>
          {formError ? (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
              {formError}
            </p>
          ) : null}
          {!property && connections.length > 1 ? (
            <ConnectionSelect
              id="property-connection"
              connections={connections}
              value={connectionId}
              onChange={setConnectionId}
            />
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="property-key">Key</Label>
            <Input
              id="property-key"
              value={key}
              disabled={!!property}
              autoFocus={!property}
              autoComplete="off"
              placeholder="company"
              aria-invalid={!!errors.key}
              onChange={(e) => setKey(e.target.value)}
              className="font-mono"
            />
            {errors.key ? (
              <p role="alert" className="text-xs text-danger-ink">
                {errors.key}
              </p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="property-type">Type</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as "string" | "number")}
              disabled={!!property}
            >
              <SelectTrigger id="property-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="string">Text</SelectItem>
                <SelectItem value="number">Number</SelectItem>
              </SelectContent>
            </Select>
            {property ? (
              <p className="text-xs text-ink-muted">The key and type are fixed once created.</p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="property-fallback">
              Default value <span className="font-normal text-ink-muted">(optional)</span>
            </Label>
            <Input
              id="property-fallback"
              value={fallback}
              inputMode={type === "number" ? "decimal" : undefined}
              aria-invalid={!!errors.fallbackValue}
              onChange={(e) => setFallback(e.target.value)}
            />
            <p className="text-xs text-ink-muted">Used in emails for contacts who have no value.</p>
            {errors.fallbackValue ? (
              <p role="alert" className="text-xs text-danger-ink">
                {errors.fallbackValue}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || (!property && !connectionId)}
              className="font-bold"
            >
              {busy ? "Saving…" : property ? "Save" : "Create property"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The contact property schema per connection (PRD §5.9). */
export function PropertiesView({
  orgSlug,
  properties,
  connections,
  canManage,
}: {
  orgSlug: string;
  properties: PropertyDTO[];
  connections: ConnectionOptionDTO[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PropertyDTO | null>(null);
  const [deleting, setDeleting] = useState<PropertyDTO | null>(null);
  const writable = connections.some((c) => c.writable);
  const multi = connections.length > 1;
  const newButton = canManage ? (
    <Button
      type="button"
      onClick={() => setCreating(true)}
      disabled={!writable}
      className="font-bold"
    >
      <Plus aria-hidden /> New property
    </Button>
  ) : null;

  return (
    <div className="grid gap-3">
      <LiveRefresh topics={["contact_properties"]} />
      {properties.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink-muted">
            {properties.length} {properties.length === 1 ? "property" : "properties"}
          </p>
          {newButton}
        </div>
      ) : null}
      {properties.length === 0 ? (
        <EmptyState title="No properties yet" mood="idle" action={newButton}>
          Add fields like company or plan to every contact, then use them in imports and broadcasts.
        </EmptyState>
      ) : (
        <ul role="list" className="grid gap-0.5 rounded-xl bg-surface p-1.5 shadow-md">
          {properties.map((p) => (
            <li
              key={p.id}
              data-testid="property-row"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-canvas"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-[13.5px] font-semibold">{p.key}</p>
                {multi ? (
                  <p className="truncate text-xs text-ink-muted">{p.connectionName}</p>
                ) : null}
              </div>
              <span className="text-[13px] text-ink-muted">
                {p.type === "number" ? "Number" : "Text"}
              </span>
              <span className="hidden w-32 truncate text-[13px] text-ink-muted min-[560px]:block">
                {p.fallbackValue === null ? "No default" : `Default: ${p.fallbackValue}`}
              </span>
              {canManage ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Actions for ${p.key}`}
                    >
                      <MoreHorizontal aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing(p)}>Edit default</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(p)}>
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {creating ? (
        <PropertyDialog
          orgSlug={orgSlug}
          connections={connections}
          onOpenChange={(o) => !o && setCreating(false)}
        />
      ) : null}
      {editing ? (
        <PropertyDialog
          orgSlug={orgSlug}
          connections={connections}
          property={editing}
          onOpenChange={(o) => !o && setEditing(null)}
        />
      ) : null}
      {deleting ? (
        <ConfirmDeleteDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title={`Delete ${deleting.key}?`}
          confirmLabel="Delete property"
          onConfirm={async () => {
            const result = await deletePropertyAction(orgSlug, { id: deleting.id });
            if (!result.ok) return audienceError(result.error);
            toast.success("Property deleted");
            router.refresh();
            return null;
          }}
        >
          <p>
            This also deletes the property in Resend ({deleting.connectionName}), along with every
            contact&apos;s value for it.
          </p>
        </ConfirmDeleteDialog>
      ) : null}
    </div>
  );
}
