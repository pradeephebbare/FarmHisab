import { loadProject } from "@/lib/data";
import { BottomNav } from "@/components/BottomNav";
import { OfflineBanner } from "@/components/OfflineBanner";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  await loadProject(id); // 404 unless the caller is an active member (also enforced by RLS)
  return (
    <>
      <OfflineBanner />
      <main className="mx-auto max-w-2xl px-4 pb-32 pt-5">{children}</main>
      <BottomNav projectId={id} />
    </>
  );
}
