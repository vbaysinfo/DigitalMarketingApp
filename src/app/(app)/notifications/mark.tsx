"use client";

import { markNotificationsReadAction } from "@/app/actions";
import { ActionButton } from "@/components/action-button";

export function MarkRead() {
  return (
    <ActionButton size="sm" action={() => markNotificationsReadAction()}>
      Mark all as read
    </ActionButton>
  );
}
