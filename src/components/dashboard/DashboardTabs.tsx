"use client";

import { useState } from "react";
import type { CategoryOption } from "@/lib/categories";
import ProfileForm from "./ProfileForm";
import ServicesManager from "./ServicesManager";
import PhotosManager from "./PhotosManager";
import InquiriesList from "./InquiriesList";
import Stars from "../Stars";
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
      <div className="mt-8 grid gap-4 sm:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
            {tx.dashboard.stats.rating}
          </p>
          {data.stats.rating !== null ? (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-2xl font-bold text-ink-900">
                {data.stats.rating.toFixed(1)}
              </span>
              <Stars rating={data.stats.rating} />
            </div>
          ) : (
            <p className="mt-1 text-2xl font-bold text-ink-300">—</p>
          )}
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
            {tx.dashboard.stats.reviews}
          </p>
          <p className="mt-1 text-2xl font-bold text-ink-900">
            {data.stats.reviewCount}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
            {tx.dashboard.stats.photos}
          </p>
          <p className="mt-1 text-2xl font-bold text-ink-900">
            {data.stats.photoCount}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
            {tx.dashboard.stats.newInquiries}
          </p>
          <p className="mt-1 text-2xl font-bold text-brand-600">
            {data.stats.newInquiries}
          </p>
        </div>
      </div>

      <div className="mt-8 flex gap-1 overflow-x-auto rounded-xl bg-ink-100 p-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === t
                ? "bg-white text-ink-900 shadow-sm"
                : "text-ink-500 hover:text-ink-800"
            }`}
          >
            {tabLabels[t]}
            {t === "Inquiries" && data.stats.newInquiries > 0 && (
              <span className="ml-1.5 rounded-full bg-brand-600 px-1.5 py-0.5 text-xs font-semibold text-white">
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
