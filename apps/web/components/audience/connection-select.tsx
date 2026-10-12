"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ConnectionOptionDTO } from "@/lib/dto/audience";

/** Which Resend account a new object goes into. Read-only or broken connections are listed but off. */
export function ConnectionSelect({
  id,
  connections,
  value,
  onChange,
  label = "Resend account",
  disabled,
}: {
  id: string;
  connections: ConnectionOptionDTO[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Choose an account" />
        </SelectTrigger>
        <SelectContent>
          {connections.map((c) => (
            <SelectItem key={c.id} value={c.id} disabled={!c.writable}>
              {c.name}
              {c.note ? ` (${c.note})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** First writable connection, or "". */
export const firstWritable = (connections: ConnectionOptionDTO[]) =>
  connections.find((c) => c.writable)?.id ?? "";
