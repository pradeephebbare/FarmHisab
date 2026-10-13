import { LoadingSkeleton } from "@/components/LoadingSkeleton";

export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <LoadingSkeleton variant="page" />
    </main>
  );
}