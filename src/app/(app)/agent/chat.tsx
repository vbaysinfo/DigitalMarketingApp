"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Bot, Loader2, SendHorizonal, Trash2, User } from "lucide-react";
import { approveAndPostAction, clearChatAction, regenerateAction, sendChatAction } from "@/app/actions";
import { ActionButton } from "@/components/action-button";
import { useToast } from "@/components/shell";
import { Card, PlatformIcon, StatusBadge, btn, cx } from "@/components/ui";
import { composeCaption } from "@/lib/platform-rules";
import { CONTENT_TYPE_LABEL, PLATFORM_LABEL, type ContentItem } from "@/lib/types";
import type { ChatMessage } from "@/lib/repo/misc";

export type ChatCard = { item: ContentItem; thumb: string | null };

const SUGGESTIONS = [
  "Create today's LinkedIn post.",
  "Create 5 reels about my business.",
  "Create this week's content and add it to the calendar.",
  "Create a promotional image post for Instagram and Facebook.",
  "Make it more professional.",
  "Translate this into Telugu and English.",
  "Show my pending approvals.",
  "Schedule this for tomorrow at 10 AM.",
];

function Md({ text }: { text: string }) {
  return (
    <div className="prose-chat text-sm leading-relaxed">
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="whitespace-pre-wrap">
          {para.split(/(\*\*[^*]+\*\*)/g).map((s, j) => (s.startsWith("**") ? <b key={j}>{s.slice(2, -2)}</b> : s))}
        </p>
      ))}
    </div>
  );
}

function ContentCard({ card }: { card: ChatCard }) {
  const { item, thumb } = card;
  const toast = useToast();
  const reviewable = ["DRAFT", "WAITING_FOR_APPROVAL", "APPROVED", "PUBLISH_FAILED"].includes(item.status);
  return (
    <Card className="w-full max-w-md overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <PlatformIcon platform={item.platform} size={18} />
        <span className="text-xs font-medium">
          {PLATFORM_LABEL[item.platform]} · {CONTENT_TYPE_LABEL[item.contentType]}
        </span>
        <StatusBadge status={item.status} className="ml-auto" />
      </div>
      {thumb && <img src={`/api/media/${thumb}`} alt="" className="max-h-64 w-full bg-surface-2 object-contain" />}
      <p className="line-clamp-6 whitespace-pre-wrap px-3 py-2 text-sm">{composeCaption(item) || item.topic}</p>
      <div className="flex flex-wrap gap-1.5 border-t border-border p-2">
        <Link href={`/library/${item.id}`} className={btn("secondary", "sm")}>
          PREVIEW
        </Link>
        {reviewable && (
          <>
            <Link href={`/library/${item.id}#editor`} className={btn("secondary", "sm")}>
              EDIT
            </Link>
            <ActionButton size="sm" action={() => regenerateAction(item.id, "")} success="Regenerated">
              REGENERATE
            </ActionButton>
            <ActionButton
              size="sm"
              variant="approve"
              confirm={`Approve and publish to ${PLATFORM_LABEL[item.platform]} now?`}
              action={() => approveAndPostAction(item.id)}
              onDone={(r) => {
                if (r.ok && r.data) {
                  if (r.data.ok) toast("success", `🟢 Published! Post ID: ${r.data.postId}`);
                  else toast("error", r.data.stage === "duplicate" ? "Similar content detected — open the preview to decide." : r.data.error);
                }
              }}
            >
              APPROVE & POST
            </ActionButton>
          </>
        )}
        {item.publishedUrl && (
          <a href={item.publishedUrl} target="_blank" rel="noreferrer" className={btn("secondary", "sm")}>
            View post
          </a>
        )}
      </div>
    </Card>
  );
}

export function ChatUI({ messages, cards, aiReady }: { messages: ChatMessage[]; cards: Record<string, ChatCard>; aiReady: boolean }) {
  const [text, setText] = useState("");
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [messages.length, optimistic]);

  const send = (msg: string) => {
    if (!msg.trim() || pending) return;
    setText("");
    setOptimistic(msg);
    start(async () => {
      const r = await sendChatAction(msg);
      if (!r.ok) toast("error", r.error);
      else if (r.data?.link && r.data.contentIds.length === 0 && /calendar/.test(r.data.link)) toast("info", "Added to your calendar — generation is running in the background.");
      setOptimistic(null);
      router.refresh();
    });
  };

  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">AI Marketing Agent</h1>
          <p className="text-xs text-muted">{aiReady ? "Ask in plain language. I create — you approve." : "Template mode: set ANTHROPIC_API_KEY for the full AI agent."}</p>
        </div>
        {messages.length > 0 && (
          <ActionButton size="sm" variant="ghost" confirm="Clear the conversation?" action={() => clearChatAction()}>
            <Trash2 size={14} /> Clear
          </ActionButton>
        )}
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-border bg-surface p-4">
        {messages.length === 0 && !optimistic && (
          <div className="mx-auto max-w-lg py-10 text-center">
            <Bot className="mx-auto text-primary" size={40} />
            <p className="mt-3 font-semibold">What should we create today?</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-surface-2">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cx("flex gap-3", m.role === "user" && "flex-row-reverse")}>
            <div className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", m.role === "user" ? "bg-surface-2" : "bg-primary text-primary-fg")}>
              {m.role === "user" ? <User size={16} /> : <Bot size={16} />}
            </div>
            <div className={cx("flex min-w-0 max-w-[85%] flex-col gap-2", m.role === "user" && "items-end")}>
              <div className={cx("rounded-2xl px-4 py-2.5", m.role === "user" ? "bg-primary text-primary-fg" : "bg-surface-2")}>
                <Md text={m.content} />
              </div>
              {m.contentIds.map((id) => (cards[id] ? <ContentCard key={id} card={cards[id]} /> : null))}
            </div>
          </div>
        ))}
        {optimistic && (
          <>
            <div className="flex flex-row-reverse gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2">
                <User size={16} />
              </div>
              <div className="rounded-2xl bg-primary px-4 py-2.5 text-sm text-primary-fg">{optimistic}</div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 size={16} className="animate-spin" /> Working on it — understanding, writing, designing and quality-checking…
            </div>
          </>
        )}
        <div ref={end} />
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input className="input flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Create a LinkedIn post about modular kitchens" disabled={pending} />
        <button className={btn("primary")} disabled={pending || !text.trim()} aria-label="Send">
          {pending ? <Loader2 size={18} className="animate-spin" /> : <SendHorizonal size={18} />}
        </button>
      </form>
    </div>
  );
}
