"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "../I18nProvider";

// Filtering (#223): target type + status, kept in the URL (shareable,
// survives refresh) like every other admin/browse filter in the app.
export type TargetTypeFilter =
  | ""
  | "PROVIDER"
  | "WORK_PHOTO"
  | "REVIEW"
  | "INQUIRY"
  | "MESSAGE"
  | "JOB"
  | "JOB_RESPONSE";
export type StatusFilter = "" | "OPEN" | "RESOLVED" | "DISMISSED";

export default function ReportsFilterBar({
  targetType: initialTargetType,
  status: initialStatus,
}: {
  targetType: TargetTypeFilter;
  status: StatusFilter;
}) {
  const [targetType, setTargetType] = useState(initialTargetType);
  const [status, setStatus] = useState(initialStatus);
  const router = useRouter();
  const t = useT().admin;

  function apply(next: { targetType?: TargetTypeFilter; status?: StatusFilter }) {
    const nt = next.targetType ?? targetType;
    const ns = next.status ?? status;
    const params = new URLSearchParams();
    if (nt) params.set("targetType", nt);
    if (ns) params.set("status", ns);
    const qs = params.toString();
    router.push(`/admin/reports${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="card flex flex-wrap items-center gap-2 p-3">
      <select
        value={targetType}
        onChange={(e) => {
          const v = e.target.value as TargetTypeFilter;
          setTargetType(v);
          apply({ targetType: v });
        }}
        aria-label={t.reportsFilterTypeLabel}
        className="input cursor-pointer sm:w-48"
      >
        <option value="">{t.reportsFilterAllTypes}</option>
        <option value="PROVIDER">{t.reportedProvider}</option>
        <option value="WORK_PHOTO">{t.reportedPhoto}</option>
        <option value="REVIEW">{t.reportedReview}</option>
        <option value="INQUIRY">{t.reportedInquiry}</option>
        <option value="MESSAGE">{t.reportedMessage}</option>
        <option value="JOB">{t.reportedJob}</option>
        <option value="JOB_RESPONSE">{t.reportedJobResponse}</option>
      </select>
      <select
        value={status}
        onChange={(e) => {
          const v = e.target.value as StatusFilter;
          setStatus(v);
          apply({ status: v });
        }}
        aria-label={t.reportsFilterStatusLabel}
        className="input cursor-pointer sm:w-44"
      >
        <option value="">{t.reportsFilterAllStatuses}</option>
        <option value="OPEN">{t.openTag}</option>
        <option value="RESOLVED">{t.resolvedTag}</option>
        <option value="DISMISSED">{t.dismissedTag}</option>
      </select>
    </div>
  );
}
