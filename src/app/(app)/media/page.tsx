import { listMedia } from "@/lib/repo/media";
import { PageHeader } from "@/components/ui";
import { MediaGrid } from "./grid";
import { MEDIA_CATEGORIES } from "@/lib/types";

export const metadata = { title: "Media Library" };

export default async function MediaPage(props: PageProps<"/media">) {
  const sp = await props.searchParams;
  const category = typeof sp.category === "string" && (MEDIA_CATEGORIES as readonly string[]).includes(sp.category) ? sp.category : undefined;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  return (
    <div>
      <PageHeader title="Media Library" subtitle="Images, videos, logos, product photos, brand assets, reels and thumbnails." />
      <MediaGrid items={listMedia({ category, q })} category={category ?? ""} q={q ?? ""} />
    </div>
  );
}
