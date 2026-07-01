"use client";

/* eslint-disable @next/next/no-img-element */
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FaUpload } from "react-icons/fa6";
import Avatar from "../Avatar";
import type { PhotoItem } from "./DashboardTabs";

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
  const [uploading, setUploading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function upload(file: File, kind: "work" | "avatar") {
    const setBusy = kind === "avatar" ? setAvatarUploading : setUploading;
    setBusy(true);
    setError("");
    const fd = new FormData();
    fd.append("file", file);
    if (kind === "avatar") fd.append("kind", "avatar");
    else if (caption.trim()) fd.append("caption", caption.trim());

    const res = await fetch("/api/provider/photos", {
      method: "POST",
      body: fd,
    });
    setBusy(false);
    if (res.ok) {
      const data = await res.json();
      if (kind === "avatar") {
        setAvatarUrl(data.avatarUrl);
      } else {
        setPhotos((list) => [
          { id: data.photo.id, url: data.photo.url, caption: data.photo.caption ?? "" },
          ...list,
        ]);
        setCaption("");
      }
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Upload failed. Please try again.");
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

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h2 className="font-semibold text-ink-900">Profile picture</h2>
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
                if (f) upload(f, "avatar");
                e.target.value = "";
              }}
            />
            <button
              onClick={() => avatarRef.current?.click()}
              disabled={avatarUploading}
              className="btn-secondary"
            >
              {avatarUploading ? "Uploading…" : "Change picture"}
            </button>
            <p className="mt-1.5 text-xs text-ink-500">
              JPEG, PNG or WebP, max 5MB.
            </p>
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="font-semibold text-ink-900">Work photos</h2>
        <p className="mt-1 text-sm text-ink-500">
          Show off your best work — these appear on your public profile.
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            className="input sm:flex-1"
            placeholder="Caption for the next photo (optional)"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={120}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f, "work");
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="btn-primary"
          >
            <FaUpload className="h-3.5 w-3.5" />
            {uploading ? "Uploading…" : "Upload photo"}
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {photos.length === 0 ? (
          <p className="mt-6 rounded-xl bg-ink-50 p-6 text-center text-sm text-ink-500">
            No work photos yet. Upload your first one above.
          </p>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((p) => (
              <div
                key={p.id}
                className="group relative aspect-square overflow-hidden rounded-xl bg-ink-100"
              >
                <img
                  src={p.url}
                  alt={p.caption || "Work photo"}
                  className="h-full w-full object-cover"
                />
                {p.caption && (
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-8 text-xs text-white">
                    {p.caption}
                  </span>
                )}
                <button
                  onClick={() => removePhoto(p.id)}
                  className="absolute right-2 top-2 hidden rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur transition hover:bg-red-600 group-hover:block"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
