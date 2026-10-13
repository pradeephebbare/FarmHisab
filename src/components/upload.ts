import { attachFile } from "@/app/actions";
import { createClient } from "@/lib/supabase/client";
import type { Key } from "@/lib/i18n";

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" };

export function checkImage(file: File): Key | null {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type) || file.size <= 0 || file.size > MAX_IMAGE_BYTES) return "exp.photoBad";
  return null;
}

/** Uploads to the private bucket (Storage re-checks size/type/membership server-side), then records the attachment. */
export async function uploadAttachment(projectId: string, entity: "expense" | "income", entityId: string, file: File): Promise<{ ok: true } | { ok: false; errorKey: Key }> {
  const bad = checkImage(file);
  if (bad) return { ok: false, errorKey: bad };
  try {
    const supabase = createClient();
    const path = `${projectId}/${entityId}/${crypto.randomUUID()}.${EXT[file.type]}`;
    const { error } = await supabase.storage.from("receipts").upload(path, file, { contentType: file.type, upsert: false });
    if (error) return { ok: false, errorKey: "exp.uploadFailed" };
    const res = await attachFile(projectId, entity, entityId, path, file.type, file.size);
    return res.ok ? { ok: true } : { ok: false, errorKey: res.errorKey };
  } catch {
    return { ok: false, errorKey: "exp.uploadFailed" };
  }
}
