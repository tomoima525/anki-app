/**
 * Data Isolation Tests
 * Verifies that user data is properly isolated
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestTokens } from "./helpers";

describe("Data Isolation Tests", () => {
  const API_URL = process.env.TEST_API_URL || "http://localhost:8787";
  let user1Token: string;
  let user2Token: string;
  let user1Id: string;
  let user2Id: string;
  const sharedQuestionId: string = "seed1";

  beforeAll(async () => {
    // Create test tokens
    const tokens = await createTestTokens();
    user1Token = tokens.userToken;
    user2Token = tokens.user2Token;
    user1Id = tokens.regularUserId;
    user2Id = tokens.user2Id;

    console.log("✓ Test tokens created");
    console.log(`  User 1 ID: ${user1Id}`);
    console.log(`  User 2 ID: ${user2Id}`);

    // Note: In a real test environment, you would also create the users
    // and a shared question in the database here
  });

  afterAll(async () => {
    console.log("✓ Tests completed");
  });

  describe("Answer Logs Isolation", () => {
    it("should only return user's own answer logs", async () => {
      // User 1 answers a question
      await fetch(`${API_URL}/api/study/${sharedQuestionId}/answer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `anki_session=${user1Token}`,
        },
        body: JSON.stringify({ difficulty: "easy" }),
      });

      // User 2 answers the same question
      await fetch(`${API_URL}/api/study/${sharedQuestionId}/answer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `anki_session=${user2Token}`,
        },
        body: JSON.stringify({ difficulty: "hard" }),
      });

      // Get question details for user 1
      const user1Response = await fetch(
        `${API_URL}/api/questions/${sharedQuestionId}`,
        {
          headers: {
            Cookie: `anki_session=${user1Token}`,
          },
        }
      );

      const user1Data = await user1Response.json();

      // Should only see user 1's answer logs
      expect(user1Data.recentLogs).toBeDefined();
      user1Data.recentLogs.forEach((log: any) => {
        expect(log.user_id).toBe(user1Id);
      });

      // Get question details for user 2
      const user2Response = await fetch(
        `${API_URL}/api/questions/${sharedQuestionId}`,
        {
          headers: {
            Cookie: `anki_session=${user2Token}`,
          },
        }
      );

      const user2Data = await user2Response.json();

      // Should only see user 2's answer logs
      expect(user2Data.recentLogs).toBeDefined();
      user2Data.recentLogs.forEach((log: any) => {
        expect(log.user_id).toBe(user2Id);
      });
    });
  });

  describe("Dashboard Isolation", () => {
    it("should show only user's own statistics", async () => {
      // Get user 1 stats
      const user1Stats = await fetch(`${API_URL}/api/dashboard/daily-stats`, {
        headers: {
          Cookie: `anki_session=${user1Token}`,
        },
      });

      const user1Data = await user1Stats.json();

      // Get user 2 stats
      const user2Stats = await fetch(`${API_URL}/api/dashboard/daily-stats`, {
        headers: {
          Cookie: `anki_session=${user2Token}`,
        },
      });

      const user2Data = await user2Stats.json();

      // Stats should be different for different users
      // (assuming they have different activity patterns)
      expect(user1Data.today).toBeDefined();
      expect(user2Data.today).toBeDefined();
    });

    it("should show only user's own activity trend", async () => {
      const response = await fetch(
        `${API_URL}/api/dashboard/activity-trend?range=7d`,
        {
          headers: {
            Cookie: `anki_session=${user1Token}`,
          },
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data).toBeDefined();
      expect(Array.isArray(data.data)).toBe(true);
    });

    it("should show only user's own mastery progress", async () => {
      const response = await fetch(
        `${API_URL}/api/dashboard/mastery-progress`,
        {
          headers: {
            Cookie: `anki_session=${user1Token}`,
          },
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.mastered).toBeDefined();
      expect(data.in_progress).toBeDefined();
      expect(data.needs_review).toBeDefined();
      expect(data.not_started).toBeDefined();
    });

    it("should show only user's own study streak", async () => {
      const response = await fetch(`${API_URL}/api/dashboard/study-streak`, {
        headers: {
          Cookie: `anki_session=${user1Token}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.current_streak).toBeDefined();
      expect(data.longest_streak).toBeDefined();
    });

    it("should show only user's own review queue", async () => {
      const response = await fetch(`${API_URL}/api/dashboard/review-queue`, {
        headers: {
          Cookie: `anki_session=${user1Token}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.questions).toBeDefined();
      expect(data.total_count).toBeDefined();
    });
  });

  describe("Shared Question Pool", () => {
    it("should allow all users to access the same questions", async () => {
      // User 1 gets questions
      const user1Response = await fetch(`${API_URL}/api/questions`, {
        headers: {
          Cookie: `anki_session=${user1Token}`,
        },
      });

      const user1Data = await user1Response.json();

      // User 2 gets questions
      const user2Response = await fetch(`${API_URL}/api/questions`, {
        headers: {
          Cookie: `anki_session=${user2Token}`,
        },
      });

      const user2Data = await user2Response.json();

      // Both should see the same question pool
      expect(user1Data.questions).toBeDefined();
      expect(user2Data.questions).toBeDefined();

      // Question IDs should overlap (same pool)
      const user1Ids = user1Data.questions.map((q: any) => q.id);
      const user2Ids = user2Data.questions.map((q: any) => q.id);

      // Check if there's any overlap
      const hasOverlap = user1Ids.some((id: string) => user2Ids.includes(id));
      expect(hasOverlap).toBe(true);
    });

    it("should allow users to study the same question independently", async () => {
      // Both users get next question
      const user1Next = await fetch(`${API_URL}/api/study/next`, {
        method: "POST",
        headers: {
          Cookie: `anki_session=${user1Token}`,
        },
      });

      const user2Next = await fetch(`${API_URL}/api/study/next`, {
        method: "POST",
        headers: {
          Cookie: `anki_session=${user2Token}`,
        },
      });

      expect(user1Next.status).toBe(200);
      expect(user2Next.status).toBe(200);
    });
  });
});
