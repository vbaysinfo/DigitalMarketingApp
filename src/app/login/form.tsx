"use client";

import { useActionState } from "react";
import { loginAction } from "../actions";
import { btn } from "@/components/ui";

export function LoginForm({ next, configured }: { next: string; configured: boolean }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  if (!configured)
    return <p className="mt-6 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">Set <code>APP_PASSWORD</code> and <code>SESSION_SECRET</code> on the server to enable sign-in.</p>;
  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" required autoFocus className="input" autoComplete="current-password" />
      </div>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button className={`${btn("primary")} w-full`} disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
