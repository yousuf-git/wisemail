"use client";

import { useMemo } from "react";

import { senderReason } from "@/components/senders/sender-status";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SenderDTO } from "@/lib/dto/mail";

/** From picker: senders grouped by domain; inactive ones are disabled with the reason shown. */
export function SenderSelect({
  senders,
  value,
  onChange,
  disabled,
  invalid,
  id,
}: {
  senders: SenderDTO[];
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, SenderDTO[]>();
    for (const sender of senders) {
      const list = map.get(sender.domainName) ?? [];
      list.push(sender);
      map.set(sender.domainName, list);
    }
    return [...map.entries()];
  }, [senders]);

  return (
    <Select value={value ?? undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        id={id}
        size="sm"
        aria-label="From"
        aria-invalid={invalid || undefined}
        className="h-8 max-w-full min-w-0 border-transparent bg-transparent px-2 shadow-none hover:bg-canvas-sunken"
      >
        <SelectValue placeholder={senders.length ? "Choose a sender" : "No senders yet"} />
      </SelectTrigger>
      <SelectContent className="max-w-[min(28rem,calc(100vw-2rem))]">
        {groups.map(([domain, list]) => (
          <SelectGroup key={domain}>
            <SelectLabel>{domain}</SelectLabel>
            {list.map((sender) => {
              const inactive = sender.status !== "active";
              return (
                <SelectItem key={sender.id} value={sender.id} disabled={inactive}>
                  <span className="grid text-left">
                    <span className="truncate">
                      {sender.displayName ? `${sender.displayName} · ` : ""}
                      {sender.address}
                    </span>
                    {inactive ? (
                      <span className="truncate text-xs text-ink-muted">
                        {senderReason(sender)}
                      </span>
                    ) : null}
                  </span>
                </SelectItem>
              );
            })}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
