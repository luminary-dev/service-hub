// Client-side mirror of the provider-service upload rules
// (services/provider-service/src/lib/storage.ts) so obviously-invalid files
// fail fast in the picker instead of wasting a round trip. The service stays
// the authority — it re-validates (and sharp re-encodes) every upload.
export const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5MB
export const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type UploadRejection = "type" | "size";

// Returns why a file would be rejected, or null when it may be uploaded.
// Takes the two fields it reads (not a full File) so tests run in plain node.
export function validateUpload(
  file: Pick<File, "type" | "size">
): UploadRejection | null {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) return "type";
  if (file.size > MAX_UPLOAD_SIZE) return "size";
  return null;
}

// Move one item of a list to a new index, immutably. Out-of-range indexes
// return an unchanged copy — drag-and-drop handlers can call this without
// range checks. Used by the photo-grid reorder (dashboard PhotosManager).
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= list.length ||
    to >= list.length
  ) {
    return next;
  }
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
