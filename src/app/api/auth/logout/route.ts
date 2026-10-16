import { crossSiteResponse, isCrossSiteRequest } from "@/lib/auth-forms";
import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

export async function POST(request: Request) {
  if (isCrossSiteRequest(request)) return crossSiteResponse();
  await destroySession();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
