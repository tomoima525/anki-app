/**
 * Example: How to create tokens with specific user data
 *
 * This shows how to use the helper functions to create tokens
 * with your actual user data from the JWT payload
 */

import { createTestToken } from "./helpers";

async function example() {
  // Example 1: Create a token with your user data
  const myToken = await createTestToken(
    "c5996861-8575-4437-9e90-69c9abe26b74",
    "tomoima525@gmail.com",
    "Tomoaki Imai",
    false // isAdmin
  );

  console.log("Token created:", myToken);

  // Example 2: Create an admin token
  const adminToken = await createTestToken(
    "admin-user-id",
    "admin@test.com",
    "Admin User",
    true // isAdmin
  );

  console.log("Admin token created:", adminToken);

  // Example 3: Use in tests
  // In your test file:
  //
  // beforeAll(async () => {
  //   adminToken = await createTestToken(
  //     "c5996861-8575-4437-9e90-69c9abe26b74",
  //     "tomoima525@gmail.com",
  //     "Tomoaki Imai",
  //     true // Make yourself admin for testing
  //   );
  //
  //   userToken = await createTestToken(
  //     "regular-user-id",
  //     "user@test.com",
  //     "Regular User",
  //     false
  //   );
  // });
}

// Uncomment to run
// example();
