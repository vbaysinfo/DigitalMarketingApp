"use client";

import Link from "next/link";
import { cancelAction, retryAction } from "@/app/actions";
import { ActionButton } from "@/components/action-button";
import { btn } from "@/components/ui";

export function RetryButtons({ id }: { id: string }) {
  return (
    <div className="mt-2 flex gap-1">
      <ActionButton size="sm" variant="primary" action={() => retryAction(id)} success={(r) => ((r as { ok?: boolean })?.ok ? "🟢 Published" : null)} onDone={() => undefined}>
        RETRY
      </ActionButton>
      <Link href={`/library/${id}#editor`} className={btn("secondary", "sm")}>EDIT</Link>
      <ActionButton size="sm" variant="danger" confirm="Cancel this post?" action={() => cancelAction(id)}>
        CANCEL
      </ActionButton>
    </div>
  );
}
