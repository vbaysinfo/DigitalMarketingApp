"use client";

import { useRouter } from "next/navigation";
import { CalendarPlus, CalendarRange } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { createCalendarAction } from "@/app/actions";
import type { Platform } from "@/lib/types";

export function PlanButtons({ platforms, language }: { platforms: Platform[]; language: string }) {
  const router = useRouter();
  const go = () => router.push("/calendar");
  return (
    <>
      <ActionButton
        variant="primary"
        action={() => createCalendarAction("week", { platforms, language, instruction: "" })}
        success={(r) => `Planning ${(r as { items: number } | undefined)?.items ?? 0} posts for your week — they'll wait for your approval.`}
        onDone={(r) => r.ok && go()}
      >
        <CalendarPlus size={16} /> CREATE MY WEEK
      </ActionButton>
      <ActionButton
        confirm="Generate 30 days of content for your preferred platforms? Everything will wait for your approval."
        action={() => createCalendarAction("month", { platforms, language, instruction: "" })}
        success={(r) => `Planning ${(r as { items: number } | undefined)?.items ?? 0} posts for 30 days.`}
        onDone={(r) => r.ok && go()}
      >
        <CalendarRange size={16} /> CREATE 30 DAYS
      </ActionButton>
    </>
  );
}
