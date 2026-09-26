import { getProfile } from "@/lib/repo/misc";
import { listMedia } from "@/lib/repo/media";
import { PageHeader } from "@/components/ui";
import { CreateForm } from "./form";
import { CONTENT_TYPES, type ContentType } from "@/lib/types";

export const metadata = { title: "Create Content" };

export default async function CreatePage(props: PageProps<"/create">) {
  const sp = await props.searchParams;
  const type = typeof sp.type === "string" && (CONTENT_TYPES as readonly string[]).includes(sp.type) ? (sp.type as ContentType) : "image";
  const p = getProfile();
  const media = typeof sp.media === "string" ? [sp.media] : [];
  return (
    <div>
      <PageHeader title="Create Content" subtitle="The AI creates platform-specific versions. You review and approve before anything is posted." />
      <CreateForm initialType={type} preferred={p.preferredPlatforms} language={p.preferredLanguage} library={listMedia()} initialMedia={media} />
    </div>
  );
}
