"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  FaChevronLeft,
  FaChevronRight,
  FaCircleCheck,
  FaCircleExclamation,
  FaUpload,
} from "@/components/icons";
import Avatar from "../Avatar";
import { useT } from "../I18nProvider";
import { useToast } from "../ToastProvider";
import { isSvg } from "@/lib/image";
import { moveItem, validateUpload } from "@/lib/upload";
import type { PhotoItem } from "./DashboardTabs";

// sharp decodes/re-encodes every upload server-side (CPU-bound), so the
// client trickles the batch through at most two requests at a time instead
// of stampeding the service.
const MAX_CONCURRENT_UPLOADS = 2;

type UploadStatus = "queued" | "uploading" | "done" | "error";

type UploadItem = {
  key: number;
  file: File;
  caption: string;
  progress: number; // 0..100, upload bytes only (server processing follows)
  status: UploadStatus;
  error: string;
  // Locally rejected files (bad type/size) are not retryable — retrying
  // would deterministically fail again.
  retryable: boolean;
};

class UploadError extends Error {}

// fetch() cannot observe upload progress, so the actual file POST goes
// through XMLHttpRequest; everything else keeps the fetch idioms used
// elsewhere in the dashboard.
function uploadPhotoXhr(
  item: UploadItem,
  onProgress: (pct: number) => void
): Promise<{ photo: { id: string; url: string; caption: string | null } }> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", item.file);
    if (item.caption) fd.append("caption", item.caption);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/provider/photos");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response);
      } else {
        const message = (xhr.response as { error?: unknown } | null)?.error;
        reject(new UploadError(typeof message === "string" ? message : ""));
      }
    };
    xhr.onerror = () => reject(new UploadError(""));
    xhr.send(fd);
  });
}

export default function PhotosManager({
  initial,
  avatarUrl: initialAvatar,
  name,
}: {
  initial: PhotoItem[];
  avatarUrl: string | null;
  name: string;
}) {
  const [photos, setPhotos] = useState(initial);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatar);
  const [caption, setCaption] = useState("");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarRef = useRef<HTMLInputElement>(null);
  const nextKey = useRef(0);
  const activeUploads = useRef(0);
  const pendingUploads = useRef<UploadItem[]>([]);
  // Guards the optimistic reorder: only the newest PATCH may revert/refresh,
  // so a slow older response can't clobber a newer order.
  const orderSeq = useRef(0);
  const dragFrom = useRef<number | null>(null);
  const router = useRouter();
  const toast = useToast();
  const ph = useT().dashboard.photos;

  function patchUpload(key: number, patch: Partial<UploadItem>) {
    setUploads((list) =>
      list.map((u) => (u.key === key ? { ...u, ...patch } : u))
    );
  }

  function rejectionMessage(reason: "type" | "size") {
    return reason === "type" ? ph.fileTypeError : ph.fileSizeError;
  }

  async function runUpload(item: UploadItem) {
    patchUpload(item.key, { status: "uploading", progress: 0, error: "" });
    try {
      const data = await uploadPhotoXhr(item, (pct) =>
        patchUpload(item.key, { progress: pct })
      );
      patchUpload(item.key, { status: "done", progress: 100 });
      setPhotos((list) => [
        {
          id: data.photo.id,
          url: data.photo.url,
          caption: data.photo.caption ?? "",
        },
        ...list,
      ]);
    } catch (e) {
      patchUpload(item.key, {
        status: "error",
        error: (e instanceof UploadError && e.message) || ph.uploadError,
      });
    } finally {
      activeUploads.current--;
      if (
        activeUploads.current === 0 &&
        pendingUploads.current.length === 0
      ) {
        router.refresh();
      }
      pump();
    }
  }

  function pump() {
    while (
      activeUploads.current < MAX_CONCURRENT_UPLOADS &&
      pendingUploads.current.length > 0
    ) {
      const item = pendingUploads.current.shift()!;
      activeUploads.current++;
      void runUpload(item);
    }
  }

  function enqueue(item: UploadItem) {
    pendingUploads.current.push(item);
    pump();
  }

  function addFiles(files: File[]) {
    if (files.length === 0) return;
    const batchCaption = caption.trim();
    const items = files.map((file, i): UploadItem => {
      const rejection = validateUpload(file);
      return {
        key: nextKey.current++,
        file,
        // The caption box labels "the next photo": it goes on the first
        // photo of the batch.
        caption: i === 0 ? batchCaption : "",
        progress: 0,
        status: rejection ? "error" : "queued",
        error: rejection ? rejectionMessage(rejection) : "",
        retryable: !rejection,
      };
    });
    setCaption("");
    // A fresh batch replaces finished rows but keeps failed ones retryable.
    setUploads((list) => [...list.filter((u) => u.status !== "done"), ...items]);
    for (const item of items) {
      if (item.status === "queued") enqueue(item);
    }
  }

  function retryUpload(item: UploadItem) {
    patchUpload(item.key, { status: "queued", progress: 0, error: "" });
    enqueue(item);
  }

  async function uploadAvatar(file: File) {
    const rejection = validateUpload(file);
    if (rejection) {
      setAvatarError(rejectionMessage(rejection));
      return;
    }
    setAvatarUploading(true);
    setAvatarError("");
    const fd = new FormData();
    fd.append("file", file);
    // Avatars are unified on the User (#434): upload through the account
    // endpoint (identity), which sets User.avatarUrl and syncs the denormalized
    // copy back to this provider profile. Response shape is unchanged.
    const res = await fetch("/api/account/avatar", {
      method: "POST",
      body: fd,
    });
    setAvatarUploading(false);
    if (res.ok) {
      const data = await res.json();
      setAvatarUrl(data.avatarUrl);
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      setAvatarError(d.error ?? ph.uploadError);
    }
  }

  async function removePhoto(id: string) {
    const res = await fetch(`/api/provider/photos/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setPhotos((list) => list.filter((p) => p.id !== id));
      router.refresh();
    }
  }

  // Optimistic reorder: show the new order immediately, persist it, and roll
  // back with a toast if the save fails.
  function applyOrder(next: PhotoItem[]) {
    const prev = photos;
    const seq = ++orderSeq.current;
    setPhotos(next);
    fetch("/api/provider/photos/order", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: next.map((p) => p.id) }),
    })
      .then((res) => {
        if (!res.ok) throw new Error();
        if (seq === orderSeq.current) router.refresh();
      })
      .catch(() => {
        if (seq === orderSeq.current) {
          setPhotos(prev);
          toast.error(ph.reorderError);
        }
      });
  }

  function movePhoto(from: number, to: number) {
    if (to < 0 || to >= photos.length || from === to) return;
    applyOrder(moveItem(photos, from, to));
  }

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="flex items-center gap-2.5">
          <span className="rounded-sm bg-brand-700 px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-white dark:text-ink-50">
            PIC
          </span>
          <h2 className="font-semibold text-ink-900">{ph.profilePicture}</h2>
        </div>
        <div className="mt-4 flex items-center gap-5">
          <Avatar name={name} url={avatarUrl} size={72} />
          <div>
            <input
              ref={avatarRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadAvatar(f);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => avatarRef.current?.click()}
              disabled={avatarUploading}
              className="btn-secondary"
            >
              {avatarUploading ? ph.uploading : ph.changePicture}
            </button>
            <p className="mt-1.5 text-xs text-ink-500">{ph.pictureHint}</p>
            {avatarError && (
              <p role="alert" className="mt-1.5 text-sm text-red-600">
                {avatarError}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="card p-6">
        <div className="flex items-center gap-2.5">
          <span className="rounded-sm bg-brand-700 px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-white dark:text-ink-50">
            IMG
          </span>
          <h2 className="font-semibold text-ink-900">{ph.workPhotos}</h2>
        </div>
        <p className="mt-1 text-sm text-ink-500">{ph.workPhotosSub}</p>

        <input
          className="input mt-4 w-full"
          placeholder={ph.captionPh}
          aria-label={ph.captionPh}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={120}
        />

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDropActive(true);
          }}
          onDragLeave={() => setDropActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDropActive(false);
            addFiles(Array.from(e.dataTransfer.files));
          }}
          className={`mt-3 flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition ${
            dropActive
              ? "border-brand-500 bg-brand-50"
              : "border-ink-200 bg-ink-50"
          }`}
        >
          <FaUpload className="h-5 w-5 text-ink-400" aria-hidden />
          <p className="text-sm font-medium text-ink-700">{ph.dropTitle}</p>
          <p className="text-xs text-ink-500">{ph.dropOr}</p>
          <button onClick={() => fileRef.current?.click()} className="btn-primary">
            {ph.browse}
          </button>
          <p className="text-xs text-ink-500">{ph.pictureHint}</p>
        </div>

        {uploads.length > 0 && (
          <ul className="mt-4 space-y-2">
            {uploads.map((u) => (
              <li
                key={u.key}
                className="rounded-xl border border-ink-100 bg-surface px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-800">
                    {u.file.name}
                  </span>
                  {u.status === "done" && (
                    <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-emerald-600">
                      <FaCircleCheck className="h-3.5 w-3.5" aria-hidden />
                      {ph.uploaded}
                    </span>
                  )}
                  {u.status === "queued" && (
                    <span className="shrink-0 text-xs text-ink-500">
                      {ph.queued}
                    </span>
                  )}
                  {u.status === "uploading" && (
                    <span className="shrink-0 text-xs tabular-nums text-ink-500">
                      {u.progress}%
                    </span>
                  )}
                  {u.status === "error" && (
                    <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-red-600">
                      <FaCircleExclamation className="h-3.5 w-3.5" aria-hidden />
                      {ph.failed}
                    </span>
                  )}
                  {u.status === "error" && u.retryable && (
                    <button
                      onClick={() => retryUpload(u)}
                      className="btn-secondary shrink-0 px-3 py-1 text-xs"
                    >
                      {ph.retry}
                    </button>
                  )}
                </div>
                {(u.status === "uploading" || u.status === "queued") && (
                  <div
                    role="progressbar"
                    aria-label={u.file.name}
                    aria-valuenow={u.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100"
                  >
                    <div
                      className="h-full rounded-full bg-brand-600 transition-[width]"
                      style={{ width: `${u.progress}%` }}
                    />
                  </div>
                )}
                {u.status === "error" && u.error && (
                  <p className="mt-1.5 text-xs text-red-600">{u.error}</p>
                )}
              </li>
            ))}
          </ul>
        )}

        {photos.length === 0 ? (
          <p className="mt-6 rounded-xl bg-ink-50 p-6 text-center text-sm text-ink-500">
            {ph.empty}
          </p>
        ) : (
          <>
            <p className="mt-5 text-xs text-ink-500">{ph.reorderHint}</p>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos.map((p, i) => (
                <div
                  key={p.id}
                  draggable
                  onDragStart={(e) => {
                    dragFrom.current = i;
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    dragFrom.current = null;
                  }}
                  onDragOver={(e) => {
                    if (dragFrom.current !== null) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    if (dragFrom.current === null) return;
                    e.preventDefault();
                    const from = dragFrom.current;
                    dragFrom.current = null;
                    movePhoto(from, i);
                  }}
                  className="group relative aspect-square cursor-grab overflow-hidden rounded-xl bg-ink-100 active:cursor-grabbing"
                >
                  <Image
                    src={p.url}
                    alt={p.caption || "Work photo"}
                    fill
                    sizes="(min-width: 640px) 33vw, 50vw"
                    unoptimized={isSvg(p.url)}
                    className="pointer-events-none object-cover"
                  />
                  {i === 0 && (
                    <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
                      {ph.cover}
                    </span>
                  )}
                  {p.caption && (
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-8 text-xs text-white">
                      {p.caption}
                    </span>
                  )}
                  <button
                    onClick={() => removePhoto(p.id)}
                    className="absolute right-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white opacity-0 backdrop-blur transition hover:bg-red-600 focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    {ph.delete}
                  </button>
                  {/* Keyboard-accessible fallback for the drag reorder. */}
                  <div className="absolute inset-x-2 bottom-2 flex justify-between opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
                    <button
                      onClick={() => movePhoto(i, i - 1)}
                      disabled={i === 0}
                      aria-label={ph.moveLeft}
                      title={ph.moveLeft}
                      className="rounded-full bg-black/60 p-1.5 text-white backdrop-blur transition hover:bg-black/80 disabled:opacity-40"
                    >
                      <FaChevronLeft className="h-3 w-3" aria-hidden />
                    </button>
                    <button
                      onClick={() => movePhoto(i, i + 1)}
                      disabled={i === photos.length - 1}
                      aria-label={ph.moveRight}
                      title={ph.moveRight}
                      className="rounded-full bg-black/60 p-1.5 text-white backdrop-blur transition hover:bg-black/80 disabled:opacity-40"
                    >
                      <FaChevronRight className="h-3 w-3" aria-hidden />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
