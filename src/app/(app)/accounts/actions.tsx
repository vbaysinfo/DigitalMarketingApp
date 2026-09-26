"use client";

import { disconnectAction, testConnectionAction } from "@/app/actions";
import { ActionButton } from "@/components/action-button";
import { btn } from "@/components/ui";
import type { Platform } from "@/lib/types";

export function AccountActions({ id, platform, canReconnect }: { id: string; platform: Platform; canReconnect: boolean }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <ActionButton size="sm" action={() => testConnectionAction(id)} success={(m) => String(m ?? "Connection OK")}>
        Test Connection
      </ActionButton>
      {canReconnect && (
        <a href={`/api/oauth/${platform}/start`} className={btn("secondary", "sm")}>
          Reconnect
        </a>
      )}
      <ActionButton size="sm" variant="danger" confirm="Disconnect this account? Scheduled posts for it will return to Approved." action={() => disconnectAction(id)} success="Disconnected">
        Disconnect
      </ActionButton>
    </div>
  );
}
