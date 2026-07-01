import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentProvider } from "@/lib/provider-auth";

export async function GET() {
  const provider = await getCurrentProvider();
  if (!provider) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const inquiries = await db.inquiry.findMany({
    where: { providerId: provider.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ inquiries });
}
