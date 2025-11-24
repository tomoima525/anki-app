# Anki-Style Interview Flashcard App — Product Spec (v1)

1. Goal and Scope

A small personal web app that:
• Imports interview questions/answers from a GitHub repo (e.g. Back-End-Developer-Interview-Questions).
• Lets you study them as flashcards.
• Shows a question → reveal answer → mark difficulty.
• Saves logs and last difficulty in a simple DB.
• Protects everything with Google OAuth authentication.
• Runs fully on Cloudflare + Next.js.

Non-goals:
• No multi-user support.
• No spaced-repetition algorithm (simple random is fine).
• Minimal UI.

⸻

2. Core User Stories
   1. Import questions
      • Sync questions from GitHub into DB via manual “Sync” button.
   2. Study session
      • See a random question.
      • Reveal answer.
      • Mark difficulty: Easy / Medium / Hard.
   3. History view
      • See list of all questions.
      • See last difficulty, last answered, count.
   4. Auth
      • Single user login required to access the app.

⸻

3. Features

3.1 Question Source & Sync
• Static config for GitHub raw URLs.
• Manual sync button:
• Fetch markdown files.
• Parse into Q/A pairs.
• Upsert into DB (stable key = hash of question text).
• Basic parsing rules:
• Questions detected by bullet or prefix.
• Answers captured until next question.

3.2 Flashcard Flow
• Random selection:
• Choose any question.
• Optional simple weighting later.
• Question screen:
• Show question only.
• “Show answer” button.
• Answer screen:
• Reveal answer.
• Buttons: Easy / Medium / Hard.
• Logging:
• Write to answer_logs.
• Update aggregates in questions.

3.3 Question List
• Table:
• Question snippet.
• Last difficulty.
• Last answered at.
• Answer count.
• Filters:
• Difficulty filter.
• Sorting:
• Last answered.
• Detail page:
• Full Q/A.
• Recent logs.

3.4 Auth
• Google OAuth 2.0 authentication.
• Automatic user account creation on first login.
• Session cookie after authentication.
• Middleware protects all pages & API routes.

⸻

4. Data Model (Cloudflare D1)

questions table

Field Type Notes
id string Primary key (hash)
question_text text
answer_text text
source text GitHub file path
created_at datetime default now
updated_at datetime default now
last_answered_at datetime nullable
last_difficulty text `easy
answer_count integer default 0

answer_logs table

Field Type Notes
id integer Autoincrement
question_id string FK to questions
difficulty text `easy
answered_at datetime

⸻

5. API Design (Next.js Route Handlers)

Authentication
• POST /api/login
• POST /api/logout

Sync
• POST /api/sync
• Fetch + parse + upsert.

Questions
• GET /api/questions
• Filters + sort.
• GET /api/questions/:id

Study
• POST /api/study/next
• POST /api/study/:id/answer

⸻

6. UI / Pages (Next.js)

/login
• Google OAuth sign-in button.

/study
• Displays question → reveal → difficulty buttons → next question.

/questions
• Table view with filters and sort.

/questions/[id]
• Full question + answer + logs.

/settings
• Manual GitHub sync button.
• Show last sync time.

⸻

7. Deployment
   • Cloudflare Pages + Cloudflare Functions (Next.js).
   • Cloudflare D1 for DB.
   • GitHub fetch via server-side fetch.
   • Secrets stored in Cloudflare env variables.

⸻

8. Done Criteria
   • Able to log in.
   • Able to sync questions from GitHub.
   • Flashcard flow works end-to-end.
   • Logs update correctly.
   • All pages require authentication.
