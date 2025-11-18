import { NextRequest, NextResponse } from "next/server";
import { verifyCredentials } from "@/lib/auth";
import { createSession, getSessionCookieConfig } from "@/lib/session";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    // Validate input
    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password required" },
        { status: 400 }
      );
    }

    // Verify credentials
    const isValid = await verifyCredentials(username, password);

    if (!isValid) {
      // Add delay to prevent timing attacks
      await new Promise((resolve) => setTimeout(resolve, 1000));

      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Create session
    const token = await createSession(username);
    const { name, options } = getSessionCookieConfig();

    // Create response with cookie
    const response = NextResponse.json({ success: true }, { status: 200 });

    response.cookies.set(name, token, options);

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
