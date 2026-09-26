"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  BarChart3,
  Bell,
  Bot,
  CalendarDays,
  History,
  Images,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  Moon,
  PenSquare,
  Settings,
  Share2,
  Sun,
  X,
} from "lucide-react";
import { cx } from "./ui";
import { logoutAction } from "@/app/actions";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/agent", label: "AI Marketing Agent", icon: Bot },
  { href: "/create", label: "Create Content", icon: PenSquare },
  { href: "/library", label: "Content Library", icon: Library },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/media", label: "Media Library", icon: Images },
  { href: "/accounts", label: "Social Accounts", icon: Share2 },
  { href: "/history", label: "Publishing History", icon: History },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with the pre-paint theme script
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
    setDark(next);
  };
  return (
    <button onClick={toggle} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text" aria-label="Toggle dark mode">
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

export function AppShell({ children, unread, aiReady, authOn }: { children: React.ReactNode; unread: number; aiReady: boolean; authOn: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const nav = (
    <nav className="flex flex-col gap-0.5 p-3">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={() => setOpen(false)}
          className={cx(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
            active(href) ? "bg-primary/10 text-primary" : "text-muted hover:bg-surface-2 hover:text-text",
          )}
        >
          <Icon size={18} />
          {label}
        </Link>
      ))}
    </nav>
  );
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-surface lg:flex">
        <Brand />
        {nav}
        <div className="mt-auto p-4 text-xs text-muted">
          <p className="rounded-lg bg-surface-2 p-3 leading-relaxed">
            <b className="text-text">AI creates. You approve.</b>
            <br />
            Nothing is published without your approval.
          </p>
        </div>
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 overflow-y-auto bg-surface shadow-xl">
            <div className="flex items-center justify-between pr-3">
              <Brand />
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="p-2">
                <X size={20} />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-surface/80 px-4 backdrop-blur">
          <button className="rounded-lg p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          {!aiReady && (
            <span className="hidden rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 sm:inline dark:bg-amber-950 dark:text-amber-300">
              AI not configured — using templates (set ANTHROPIC_API_KEY)
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <Link href="/notifications" className="relative rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text" aria-label="Notifications">
              <Bell size={18} />
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-4 text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
            <ThemeToggle />
            {authOn && (
              <form action={logoutAction}>
                <button className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text" aria-label="Log out">
                  <LogOut size={18} />
                </button>
              </form>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 px-5 py-4">
      <img src="/icon.svg" alt="" className="h-8 w-8" />
      <div className="leading-tight">
        <p className="text-sm font-bold">AI Social Agent</p>
        <p className="text-[11px] text-muted">Create · Approve · Post</p>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------- Toasts

type Toast = { id: number; kind: "success" | "error" | "info"; text: string };
const ToastCtx = createContext<(kind: Toast["kind"], text: string) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 9000 : 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto rounded-xl border px-4 py-3 text-sm shadow-lg",
              t.kind === "success" && "border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200",
              t.kind === "error" && "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
              t.kind === "info" && "border-border bg-surface text-text",
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
