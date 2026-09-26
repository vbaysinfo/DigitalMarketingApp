"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { btn } from "./ui";
import { useToast } from "./shell";
import type { ActionResult } from "@/app/actions";

export function ActionButton<T>({
  action,
  children,
  variant = "secondary",
  size = "md",
  confirm,
  success,
  onDone,
  className,
  disabled,
  title,
}: {
  action: () => Promise<ActionResult<T>>;
  children: React.ReactNode;
  variant?: Parameters<typeof btn>[0];
  size?: Parameters<typeof btn>[1];
  confirm?: string;
  success?: string | ((data: T | undefined) => string | null);
  onDone?: (r: ActionResult<T>) => void;
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <button
      type="button"
      title={title}
      disabled={pending || disabled}
      className={`${btn(variant, size)} ${className ?? ""}`}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          const r = await action();
          if (!r.ok) toast("error", r.error);
          else {
            const msg = typeof success === "function" ? success(r.data) : success;
            if (msg) toast("success", msg);
          }
          onDone?.(r);
          router.refresh();
        });
      }}
    >
      {pending && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}
