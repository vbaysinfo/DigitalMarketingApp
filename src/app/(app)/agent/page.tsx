import { listChat } from "@/lib/repo/misc";
import { getContent } from "@/lib/repo/content";
import { getMedia } from "@/lib/repo/media";
import { aiConfigured } from "@/lib/ai/client";
import { ChatUI, type ChatCard } from "./chat";
import type { ContentItem } from "@/lib/types";

export const metadata = { title: "AI Marketing Agent" };

export default function AgentPage() {
  const messages = listChat(100);
  const cards: Record<string, ChatCard> = {};
  for (const m of messages)
    for (const id of m.contentIds) {
      const c = getContent(id);
      if (!c) continue;
      cards[id] = { item: c as ContentItem, thumb: c.mediaIds.map(getMedia).find((x) => x?.mime.startsWith("image/"))?.id ?? c.video?.thumbnailMediaId ?? null };
    }
  return <ChatUI messages={messages} cards={cards} aiReady={aiConfigured()} />;
}
