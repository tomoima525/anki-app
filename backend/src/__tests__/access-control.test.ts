/**
 * Access Control Tests
 * Verifies role-based access control for admin operations
 */

import { describe, it, expect, beforeAll } from "vitest";

describe("Access Control Tests", () => {
  const API_URL = process.env.TEST_API_URL || "http://localhost:8787";
  let adminToken: string;
  let userToken: string;
  let adminUserId: string;
  let regularUserId: string;

  beforeAll(async () => {
    // TODO: Setup test users and get tokens
    // This assumes you have a way to create test sessions
    console.log("Setting up test users...");
  });

  describe("Question Management", () => {
    it("should allow admin to delete questions", async () => {
      // Create a test question first
      const questionId = "test-question-id";

      const response = await fetch(`${API_URL}/api/questions/${questionId}`, {
        method: "DELETE",
        headers: {
          Cookie: `anki_session=${adminToken}`,
        },
      });

      expect(response.status).toBe(200);
    });

    it("should deny regular users from deleting questions", async () => {
      const questionId = "test-question-id";

      const response = await fetch(`${API_URL}/api/questions/${questionId}`, {
        method: "DELETE",
        headers: {
          Cookie: `anki_session=${userToken}`,
        },
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toContain("Admin access required");
    });

    it("should allow all authenticated users to read questions", async () => {
      const response = await fetch(`${API_URL}/api/questions`, {
        headers: {
          Cookie: `anki_session=${userToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.questions).toBeDefined();
    });

    it("should deny unauthenticated users from reading questions", async () => {
      const response = await fetch(`${API_URL}/api/questions`);

      expect(response.status).toBe(401);
    });
  });

  describe("GitHub Sync", () => {
    it("should allow admin to trigger GitHub sync", async () => {
      const response = await fetch(`${API_URL}/api/sync/github`, {
        method: "POST",
        headers: {
          Cookie: `anki_session=${adminToken}`,
        },
      });

      // May fail if GitHub token not configured, but should not be 403
      expect([200, 500]).toContain(response.status);
    });

    it("should deny regular users from triggering GitHub sync", async () => {
      const response = await fetch(`${API_URL}/api/sync/github`, {
        method: "POST",
        headers: {
          Cookie: `anki_session=${userToken}`,
        },
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toContain("Admin access required");
    });
  });

  describe("User Management", () => {
    it("should allow admin to list all users", async () => {
      const response = await fetch(`${API_URL}/api/users`, {
        headers: {
          Cookie: `anki_session=${adminToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.users).toBeDefined();
      expect(data.pagination).toBeDefined();
    });

    it("should deny regular users from listing all users", async () => {
      const response = await fetch(`${API_URL}/api/users`, {
        headers: {
          Cookie: `anki_session=${userToken}`,
        },
      });

      expect(response.status).toBe(403);
    });

    it("should allow users to get their own profile", async () => {
      const response = await fetch(`${API_URL}/api/users/me`, {
        headers: {
          Cookie: `anki_session=${userToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.user.id).toBe(regularUserId);
    });

    it("should allow admin to get any user by ID", async () => {
      const response = await fetch(`${API_URL}/api/users/${regularUserId}`, {
        headers: {
          Cookie: `anki_session=${adminToken}`,
        },
      });

      expect(response.status).toBe(200);
    });

    it("should deny regular users from getting other users by ID", async () => {
      const response = await fetch(`${API_URL}/api/users/${adminUserId}`, {
        headers: {
          Cookie: `anki_session=${userToken}`,
        },
      });

      expect(response.status).toBe(403);
    });
  });
});
