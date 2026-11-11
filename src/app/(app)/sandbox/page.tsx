import { redirect } from "next/navigation";

/** Sandbox phone now lives under Settings > Channels; old links and bookmarks keep working. */
export default async function Page({ searchParams }: { searchParams: Promise<{ test?: string }> }) {
  const { test } = await searchParams;
  redirect(test ? `/settings/sandbox?test=${encodeURIComponent(test)}` : "/settings/sandbox");
}
