"use client";

import { useState } from "react";
import type { CategoryOption } from "@/lib/categories";
import ProfileForm from "./ProfileForm";
import ServicesManager from "./ServicesManager";
import PhotosManager from "./PhotosManager";
import InquiriesList from "./InquiriesList";
import { useT } from "../I18nProvider";

export type ServiceItem = {
  id: string;
  title: string;
  description: string;
  price: number;
  priceType: string;
};

export type PhotoItem = { id: string; url: string; caption: string };

export type InquiryItem = {
  id: string;
  name: string;
  phone: string;
  email: string;
  message: string;
  status: string;
  createdAt: string;
  unreadCount?: number;
};

export type DashboardData = {
  providerId: string;
  name: string;
  email: string;
  phone: string;
  category: string;
  headline: string;
  bio: string;
  district: string;
  city: string;
  experience: number;
  available: boolean;
  // ISO string while the provider is away (#49); null when not set.
  awayUntil: string | null;
  avatarUrl: string | null;
  whatsapp: string;
  phone2: string;
  facebook: string;
  instagram: string;
  tiktok: string;
  youtube: string;
  website: string;
  services: ServiceItem[];
  photos: PhotoItem[];
  inquiries: InquiryItem[];
  stats: {
    rating: number | null;
    reviewCount: number;
    photoCount: number;
    newInquiries: number;
  };
};

const TABS = ["Profile", "Services", "Photos", "Inquiries"] as const;

export default function DashboardTabs({
  data,
  categories,
}: {
  data: DashboardData;
  categories?: CategoryOption[];
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Profile");
  const tx = useT();
  const tabLabels: Record<(typeof TABS)[number], string> = {
    Profile: tx.dashboard.tabs.profile,
    Services: tx.dashboard.tabs.services,
    Photos: tx.dashboard.tabs.photos,
    Inquiries: tx.dashboard.tabs.inquiries,
  };

  return (
    <div>
      {/* Blueprint tab strip: mono uppercase labels with a numeric spec code
          and a brand underline on the active section. */}
      <div className="mt-8 flex gap-1 overflow-x-auto border-b border-ink-200">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-current={tab === t ? "true" : undefined}
            className={`relative -mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-[0.12em] transition-colors duration-200 ease-snap ${
              tab === t
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-ink-500 hover:text-ink-800"
            }`}
          >
            <span className="text-[10px] tabular-nums text-ink-400">
              {String(i + 1).padStart(2, "0")}
            </span>
            {tabLabels[t]}
            {t === "Inquiries" && data.stats.newInquiries > 0 && (
              <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white dark:text-ink-50">
                {data.stats.newInquiries}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "Profile" && (
          <ProfileForm data={data} categories={categories} />
        )}
        {tab === "Services" && (
          <ServicesManager initial={data.services} />
        )}
        {tab === "Photos" && (
          <PhotosManager
            initial={data.photos}
            avatarUrl={data.avatarUrl}
            name={data.name}
          />
        )}
        {tab === "Inquiries" && <InquiriesList initial={data.inquiries} />}
      </div>
    </div>
  );
}
