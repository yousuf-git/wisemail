import Link from "next/link";

import { MotionProvider } from "@/components/app/motion-provider";
import { Wizi } from "@/components/mascot/wizi";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <MotionProvider>
      <main className="flex flex-1 flex-col items-center justify-center gap-5 px-4 py-16 text-center">
        <Wizi mood="detective" size={160} interactive={false} />
        <div className="grid max-w-[44ch] gap-2">
          <h1 className="text-2xl leading-8 font-bold tracking-[-0.02em] text-balance">
            Wizi looked everywhere and found nothing
          </h1>
          <p className="text-ink-muted">
            This page does not exist, or you may not have access to it. Check the address, or head
            back to somewhere familiar.
          </p>
        </div>
        <Button asChild size="lg" className="h-11 rounded-md px-6 font-bold">
          <Link href="/">Back to Wisemail</Link>
        </Button>
      </main>
    </MotionProvider>
  );
}
