import { NextResponse } from "next/server";
import { getSessionCookieConfig } from "@/lib/session";

export async function POST() {
  const { name } = getSessionCookieConfig();

  const response = NextResponse.json({ success: true }, { status: 200 });

  // Clear cookie by setting maxAge to 0
  response.cookies.set(name, "", {
    maxAge: 0,
    path: "/",
  });

  return response;
}
