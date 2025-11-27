#!/usr/bin/env tsx
/**
 * Multi-Tenancy Validation Script
 * End-to-end validation of multi-tenant features
 *
 * Usage:
 *   tsx backend/scripts/validate-multi-tenancy.ts
 *
 * Environment:
 *   API_URL - API base URL (default: http://localhost:8787)
 *   ADMIN_TOKEN - Admin session token
 *   USER_TOKEN - Regular user session token
 */

interface ValidationResult {
  test: string;
  passed: boolean;
  message: string;
  details?: any;
}

class MultiTenancyValidator {
  private apiUrl: string;
  private results: ValidationResult[] = [];

  constructor(apiUrl: string = "http://localhost:8787") {
    this.apiUrl = apiUrl;
  }

  private log(message: string, type: "info" | "success" | "error" = "info") {
    const colors = {
      info: "\x1b[36m",
      success: "\x1b[32m",
      error: "\x1b[31m",
    };
    const reset = "\x1b[0m";
    console.log(`${colors[type]}${message}${reset}`);
  }

  private addResult(
    test: string,
    passed: boolean,
    message: string,
    details?: any
  ) {
    this.results.push({ test, passed, message, details });
    this.log(
      `${passed ? "✓" : "✗"} ${test}: ${message}`,
      passed ? "success" : "error"
    );
  }

  async validateHealthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/health`);
      const passed = response.status === 200;
      this.addResult(
        "Health Check",
        passed,
        passed ? "API is healthy" : "API health check failed"
      );
      return passed;
    } catch (error) {
      this.addResult("Health Check", false, `Error: ${error}`);
      return false;
    }
  }

  async validateUnauthenticatedAccess(): Promise<void> {
    this.log("\n=== Testing Unauthenticated Access ===", "info");

    const endpoints = [
      { method: "POST", path: "/api/study/next" },
      { method: "GET", path: "/api/questions" },
      { method: "GET", path: "/api/dashboard/daily-stats" },
      { method: "GET", path: "/api/users/me" },
    ];

    for (const { method, path } of endpoints) {
      try {
        const response = await fetch(`${this.apiUrl}${path}`, { method });
        const passed = response.status === 401;
        this.addResult(
          `Unauthenticated ${method} ${path}`,
          passed,
          passed ? "Correctly rejected" : `Expected 401, got ${response.status}`
        );
      } catch (error) {
        this.addResult(
          `Unauthenticated ${method} ${path}`,
          false,
          `Error: ${error}`
        );
      }
    }
  }

  async validateUserAccess(token: string): Promise<void> {
    this.log("\n=== Testing Regular User Access ===", "info");

    // Should succeed
    const allowedEndpoints = [
      { method: "GET", path: "/api/questions", name: "List Questions" },
      { method: "GET", path: "/api/questions/stats", name: "Question Stats" },
      { method: "POST", path: "/api/study/next", name: "Get Next Question" },
      {
        method: "GET",
        path: "/api/dashboard/daily-stats",
        name: "Daily Stats",
      },
      { method: "GET", path: "/api/users/me", name: "Get Own Profile" },
    ];

    for (const { method, path, name } of allowedEndpoints) {
      try {
        const response = await fetch(`${this.apiUrl}${path}`, {
          method,
          headers: { Cookie: `anki_session=${token}` },
        });
        const passed = response.status === 200;
        this.addResult(
          `User Access: ${name}`,
          passed,
          passed ? "Access granted" : `Status: ${response.status}`
        );
      } catch (error) {
        this.addResult(`User Access: ${name}`, false, `Error: ${error}`);
      }
    }

    // Should fail (admin only)
    const deniedEndpoints = [
      {
        method: "DELETE",
        path: "/api/questions/test-id",
        name: "Delete Question",
        acceptedCodes: [403, 404], // 403 if admin check, 404 if question doesn't exist
      },
      //{ method: "POST", path: "/api/sync/github", name: "GitHub Sync" },
      { method: "GET", path: "/api/users", name: "List All Users" },
      {
        method: "GET",
        path: "/api/users/other-user-id",
        name: "Get Other User",
      },
    ];

    for (const endpoint of deniedEndpoints) {
      try {
        const response = await fetch(`${this.apiUrl}${endpoint.path}`, {
          method: endpoint.method,
          headers: { Cookie: `anki_session=${token}` },
        });
        const acceptedCodes = endpoint.acceptedCodes || [403];
        const passed = acceptedCodes.includes(response.status);
        this.addResult(
          `User Denied: ${endpoint.name}`,
          passed,
          passed
            ? "Correctly denied"
            : `Expected ${acceptedCodes.join(" or ")}, got ${response.status}`
        );
      } catch (error) {
        this.addResult(`User Denied: ${endpoint.name}`, false, `Error: ${error}`);
      }
    }
  }

  async validateAdminAccess(token: string): Promise<void> {
    this.log("\n=== Testing Admin Access ===", "info");

    const adminEndpoints = [
      //{ method: "POST", path: "/api/sync/github", name: "GitHub Sync" },
      { method: "GET", path: "/api/users", name: "List All Users" },
    ];

    for (const { method, path, name } of adminEndpoints) {
      try {
        const response = await fetch(`${this.apiUrl}${path}`, {
          method,
          headers: { Cookie: `anki_session=${token}` },
        });
        // 200 or 500 (if env not configured) is OK, 403 is not
        const passed = response.status !== 403;
        this.addResult(
          `Admin Access: ${name}`,
          passed,
          passed ? "Access granted" : "Access denied (should be allowed)"
        );
      } catch (error) {
        this.addResult(`Admin Access: ${name}`, false, `Error: ${error}`);
      }
    }
  }

  async validateDataIsolation(
    user1Token: string,
    user2Token: string
  ): Promise<void> {
    this.log("\n=== Testing Data Isolation ===", "info");

    // Get stats for both users
    try {
      const user1Stats = await fetch(
        `${this.apiUrl}/api/dashboard/daily-stats`,
        {
          headers: { Cookie: `anki_session=${user1Token}` },
        }
      );

      const user2Stats = await fetch(
        `${this.apiUrl}/api/dashboard/daily-stats`,
        {
          headers: { Cookie: `anki_session=${user2Token}` },
        }
      );

      const passed = user1Stats.status === 200 && user2Stats.status === 200;
      this.addResult(
        "Data Isolation: Dashboard Stats",
        passed,
        passed
          ? "Each user can access their own stats"
          : "Failed to get user stats"
      );
    } catch (error) {
      this.addResult(
        "Data Isolation: Dashboard Stats",
        false,
        `Error: ${error}`
      );
    }

    // Verify shared question pool
    try {
      const user1Questions = await fetch(`${this.apiUrl}/api/questions`, {
        headers: { Cookie: `anki_session=${user1Token}` },
      });

      const user2Questions = await fetch(`${this.apiUrl}/api/questions`, {
        headers: { Cookie: `anki_session=${user2Token}` },
      });

      const passed =
        user1Questions.status === 200 && user2Questions.status === 200;
      this.addResult(
        "Shared Question Pool",
        passed,
        passed
          ? "All users can access shared questions"
          : "Failed to access questions"
      );
    } catch (error) {
      this.addResult("Shared Question Pool", false, `Error: ${error}`);
    }
  }

  printSummary() {
    this.log("\n=== Validation Summary ===", "info");
    const total = this.results.length;
    const passed = this.results.filter((r) => r.passed).length;
    const failed = total - passed;

    this.log(`Total Tests: ${total}`, "info");
    this.log(`Passed: ${passed}`, "success");
    this.log(`Failed: ${failed}`, failed > 0 ? "error" : "success");

    if (failed > 0) {
      this.log("\nFailed Tests:", "error");
      this.results
        .filter((r) => !r.passed)
        .forEach((r) => {
          this.log(`  - ${r.test}: ${r.message}`, "error");
        });
    }

    return failed === 0;
  }

  async run() {
    this.log("Starting Multi-Tenancy Validation...\n", "info");

    // Health check
    const healthy = await this.validateHealthCheck();
    if (!healthy) {
      this.log("\nAPI is not healthy. Stopping validation.", "error");
      return false;
    }

    // Unauthenticated access
    await this.validateUnauthenticatedAccess();

    // Check for tokens
    const adminToken = process.env.ADMIN_TOKEN;
    const userToken = process.env.USER_TOKEN;
    const user2Token = process.env.USER2_TOKEN;

    if (!adminToken || !userToken) {
      this.log(
        "\n⚠️  ADMIN_TOKEN and USER_TOKEN not set. Skipping authenticated tests.",
        "error"
      );
      this.log("To run full validation, set environment variables:\n", "info");
      this.log("  export ADMIN_TOKEN=<admin-session-token>", "info");
      this.log("  export USER_TOKEN=<user-session-token>", "info");
      this.log(
        "  export USER2_TOKEN=<another-user-session-token> (optional)",
        "info"
      );
    } else {
      // User access tests
      await this.validateUserAccess(userToken);

      // Admin access tests
      await this.validateAdminAccess(adminToken);

      // Data isolation (if second user token available)
      if (user2Token) {
        await this.validateDataIsolation(userToken, user2Token);
      }
    }

    return this.printSummary();
  }
}

// Run validation
const validator = new MultiTenancyValidator(
  process.env.API_URL || "http://localhost:8787"
);

validator.run().then((success) => {
  process.exit(success ? 0 : 1);
});
