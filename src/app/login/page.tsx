import { LoginForm } from "./form";

export const metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <img src="/icon.svg" alt="" className="h-10 w-10" />
        <h1 className="mt-4 text-xl font-bold">AI Social Marketing Agent</h1>
        <p className="mt-1 text-sm text-muted">Sign in to manage your content.</p>
        <LoginForm next={next} configured={Boolean(process.env.APP_PASSWORD)} />
      </div>
    </div>
  );
}
