"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormAlert } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { acceptInvitationAction } from "./actions";

export function AcceptButton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setPending(true);
    setError(null);
    const result = await acceptInvitationAction(token);
    if (!result.ok) {
      setPending(false);
      setError(result.error.message);
      return;
    }
    router.replace(`/${result.data.orgSlug}`);
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      <FormAlert>{error}</FormAlert>
      <Button size="lg" className="w-full font-bold" onClick={accept} disabled={pending}>
        {pending ? "Joining…" : "Accept invitation"}
      </Button>
    </div>
  );
}
