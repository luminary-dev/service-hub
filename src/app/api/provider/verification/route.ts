import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentProvider } from "@/lib/provider-auth";
import { storeImage, validateImage } from "@/lib/upload";

// Provider submits verification documents (NIC and/or business registration).
// Sensitive PII — the stored URLs are only ever returned to admins.
export async function POST(req: NextRequest) {
  const provider = await getCurrentProvider();
  if (!provider) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (provider.verificationStatus === "VERIFIED") {
    return NextResponse.json(
      { error: "Your profile is already verified." },
      { status: 400 }
    );
  }

  const form = await req.formData().catch(() => null);
  const nic = form?.get("nic");
  const business = form?.get("business");

  const uploads: { kind: string; file: File }[] = [];
  for (const [kind, value] of [
    ["NIC", nic],
    ["BUSINESS", business],
  ] as const) {
    if (value instanceof File && value.size > 0) {
      const check = validateImage(value);
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: 400 });
      }
      uploads.push({ kind, file: check.file });
    }
  }

  if (uploads.length === 0) {
    return NextResponse.json(
      { error: "Upload at least one document (NIC or business registration)." },
      { status: 400 }
    );
  }

  // Replace any previous submission's documents.
  await db.verificationDocument.deleteMany({
    where: { providerId: provider.id },
  });
  for (const { kind, file } of uploads) {
    const url = await storeImage(file, "verification");
    await db.verificationDocument.create({
      data: { providerId: provider.id, kind, url },
    });
  }

  await db.provider.update({
    where: { id: provider.id },
    data: { verificationStatus: "PENDING", verifiedAt: null },
  });

  return NextResponse.json({ status: "PENDING" });
}
