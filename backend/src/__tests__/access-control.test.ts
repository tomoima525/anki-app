/**
 * Access Control Tests
 * Verifies role-based access control for admin operations
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestTokens } from "./helpers";

describe("Access Control Tests", () => {
  const API_URL = process.env.TEST_API_URL || "http://localhost:8787";
  let adminToken: string;
  let userToken: string;
  let adminUserId: string;
  let regularUserId: string;

  beforeAll(async () => {
    // Create test tokens
    const tokens = await createTestTokens();
    adminToken = tokens.adminToken;
    userToken = tokens.userToken;
    adminUserId = tokens.adminUserId;
    regularUserId = tokens.regularUserId;

    console.log("✓ Test tokens created");
    console.log(`  Admin User ID: ${adminUserId}`);
    console.log(`  Regular User ID: ${regularUserId}`);

    // Note: In a real test environment, you would also create the users
    // in the database here using createTestUsers()
    // For now, tests will work with the tokens but may fail if the
    // backend validates user existence in the database
  });

  afterAll(async () => {
    console.log("✓ Tests completed");
  });

  describe("Question Management", () => {
    // it("should allow admin to delete questions", async () => {
    //   // Create a test question first
    //   const questionId = "test-question-id";

    //   const response = await fetch(`${API_URL}/api/questions/${questionId}`, {
    //     method: "DELETE",
    //     headers: {
    //       Cookie: `anki_session=${adminToken}`,
    //     },
    //   });

    //   expect(response.status).toBe(200);
    // });

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
    // it("should allow admin to trigger GitHub sync", async () => {
    //   const response = await fetch(`${API_URL}/api/sync/github`, {
    //     method: "POST",
    //     headers: {
    //       Cookie: `anki_session=${adminToken}`,
    //     },
    //   });

    //   // May fail if GitHub token not configured, but should not be 403
    //   expect([200, 500]).toContain(response.status);
    // });

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
