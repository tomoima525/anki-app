# Daily Progress Dashboard Specification

## 1. Overview

### Purpose
Create a comprehensive dashboard to monitor daily learning progress in the Anki Interview App, providing users with actionable insights into their study habits, performance trends, and mastery progression.

### Objectives
- Visualize daily study activity and engagement patterns
- Track learning velocity and question mastery over time
- Identify knowledge gaps and questions requiring review
- Motivate consistent study through progress visualization and streak tracking
- Provide data-driven insights to optimize study sessions

---

## 2. Key Metrics & Data Points

### 2.1 Daily Activity Metrics

**Questions Answered Today**
- Total count of answer submissions today
- Breakdown by difficulty (Easy/Medium/Hard)
- Percentage distribution
- Comparison to daily average

**Unique Questions Studied**
- Count of distinct questions answered today
- Differentiate between new questions vs. reviews
- Highlight questions answered multiple times today

**Study Time Estimate**
- Based on answer timestamps (time between consecutive answers)
- Total active study time today
- Average time per question

### 2.2 Performance Metrics

**Difficulty Distribution Trend**
- Daily breakdown of easy/medium/hard ratings
- 7-day and 30-day rolling averages
- Trend direction (improving/declining/stable)

**Mastery Progression**
- Questions mastered (3+ consecutive "easy" ratings)
- Questions in progress (mixed ratings)
- Questions marked "hard" in last attempt
- Mastery rate (% of total questions mastered)

**Question Confidence Score**
- Calculate confidence based on recent answer history
- Formula: `(easy_count * 3 + medium_count * 1.5 - hard_count * 1) / total_answers`
- Average confidence score across all questions

### 2.3 Progress Metrics

**Overall Completion**
- Total questions in database
- Questions answered at least once (coverage %)
- Questions never attempted
- Questions due for review (>7 days since last answer)

**Weekly Progress**
- Questions answered per day (last 7 days)
- Active study days this week
- Total weekly volume vs. previous week

**Learning Velocity**
- New questions attempted per day
- Average reviews per question
- Question completion rate (questions → mastery)

### 2.4 Engagement Metrics

**Study Streak**
- Current consecutive days with activity
- Longest streak (all-time)
- Days studied this month
- Monthly consistency rate

**Session Analytics**
- Average questions per session
- Typical session duration
- Peak study hours (hour-of-day heatmap)
- Most productive day of week

---

## 3. Dashboard Layout & UI Components

### 3.1 Page Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Dashboard - Daily Progress                    [Date Picker]│
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐│
│  │ Today's Stats  │  │ Study Streak   │  │ Weekly Volume  ││
│  │ 15 questions   │  │  🔥 3 days     │  │  📊 78 total   ││
│  │ 8E / 5M / 2H   │  │ Best: 12 days  │  │  +12% vs last  ││
│  └────────────────┘  └────────────────┘  └────────────────┘│
│                                                               │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ 📈 Activity Chart (Last 7 Days)                          ││
│  │ [Bar chart showing daily question counts with            ││
│  │  stacked difficulty colors]                              ││
│  └──────────────────────────────────────────────────────────┘│
│                                                               │
│  ┌─────────────────────┐  ┌─────────────────────────────────┐│
│  │ 🎯 Mastery Progress │  │ 📊 Performance Trend            ││
│  │                     │  │                                 ││
│  │ Mastered: 45 (30%)  │  │ [Line chart showing difficulty  ││
│  │ In Progress: 60     │  │  distribution trend over time]  ││
│  │ Not Started: 45     │  │                                 ││
│  │                     │  │ Easy trend: ↑ 15%              ││
│  │ [Progress ring]     │  │ Hard trend: ↓ 8%               ││
│  └─────────────────────┘  └─────────────────────────────────┘│
│                                                               │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ 🔍 Needs Review (8 questions)                            ││
│  │ • Question about closures (last: 12 days ago)            ││
│  │ • Async/await patterns (last: 9 days ago)               ││
│  │ • Prototype chain (last marked "hard")                   ││
│  │ [View All →]                                             ││
│  └──────────────────────────────────────────────────────────┘│
│                                                               │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ 📅 Study Heatmap (Last 30 Days)                          ││
│  │ [Calendar grid showing activity intensity]               ││
│  └──────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Component Details

#### Summary Cards (Top Row)
- **Today's Stats Card**
  - Large number: total questions answered
  - Breakdown: Easy/Medium/Hard with color coding
  - Sub-text: comparison to daily average
  - Icon: 📝 or 📚

- **Study Streak Card**
  - Large number: current streak with flame icon
  - Sub-text: best streak record
  - Visual indicator: streak at risk if last study >20 hours ago
  - Icon: 🔥

- **Weekly Volume Card**
  - Large number: total questions this week
  - Trend indicator: % change vs. last week
  - Mini sparkline showing daily distribution
  - Icon: 📊

#### Activity Chart
- **Type**: Stacked bar chart
- **X-axis**: Last 7 days (dates)
- **Y-axis**: Number of questions
- **Bars**: Stacked by difficulty (green/yellow/red)
- **Interactions**:
  - Hover to see exact counts
  - Click to filter date range
- **Library**: Recharts or Chart.js

#### Mastery Progress
- **Type**: Donut/ring chart with stats
- **Segments**:
  - Mastered (green): 3+ consecutive easy answers
  - In Progress (blue): mixed difficulty
  - Not Started (gray): never answered
- **Center**: Percentage mastered
- **List**: Counts for each category

#### Performance Trend
- **Type**: Multi-line chart
- **Lines**:
  - Easy answers (green)
  - Medium answers (yellow)
  - Hard answers (red)
- **X-axis**: Last 30 days
- **Y-axis**: Percentage of daily answers
- **Trend indicators**: Up/down arrows with percentages

#### Needs Review Section
- **Type**: List with action items
- **Criteria**:
  - Last answered >7 days ago
  - Last marked as "hard"
  - Never answered but related to recently studied topics
- **Display**:
  - Question preview (truncated)
  - Days since last study
  - Quick action: "Review Now" button
- **Limit**: Top 5, with "View All" link

#### Study Heatmap
- **Type**: Calendar grid (GitHub-style)
- **Range**: Last 30 days (or user-selected range)
- **Colors**: Intensity based on questions answered
  - 0: Light gray
  - 1-5: Light green
  - 6-10: Medium green
  - 11-15: Dark green
  - 16+: Darkest green
- **Interactions**: Hover to see exact count for that day

### 3.3 Additional Features

**Date Range Selector**
- Quick options: Today, Last 7 days, Last 30 days, All time
- Custom date range picker
- Updates all dashboard components

**Export Options**
- Download progress report as PDF
- Export data as CSV
- Share progress snapshot (image)

**Quick Actions**
- "Start Study Session" button (prominent)
- "Review Difficult Questions" shortcut
- "Browse All Questions" link

---

## 4. Data Requirements

### 4.1 Database Queries

#### Query 1: Daily Activity Stats
```sql
SELECT
  COUNT(*) as total_answers,
  COUNT(DISTINCT question_id) as unique_questions,
  SUM(CASE WHEN difficulty = 'easy' THEN 1 ELSE 0 END) as easy_count,
  SUM(CASE WHEN difficulty = 'medium' THEN 1 ELSE 0 END) as medium_count,
  SUM(CASE WHEN difficulty = 'hard' THEN 1 ELSE 0 END) as hard_count,
  MIN(answered_at) as first_answer,
  MAX(answered_at) as last_answer
FROM answer_logs
WHERE DATE(answered_at) = DATE('now', 'localtime')
```

#### Query 2: 7-Day Activity Trend
```sql
SELECT
  DATE(answered_at) as answer_date,
  COUNT(*) as total_answers,
  COUNT(DISTINCT question_id) as unique_questions,
  SUM(CASE WHEN difficulty = 'easy' THEN 1 ELSE 0 END) as easy_count,
  SUM(CASE WHEN difficulty = 'medium' THEN 1 ELSE 0 END) as medium_count,
  SUM(CASE WHEN difficulty = 'hard' THEN 1 ELSE 0 END) as hard_count
FROM answer_logs
WHERE answered_at >= DATE('now', '-7 days', 'localtime')
GROUP BY DATE(answered_at)
ORDER BY answer_date ASC
```

#### Query 3: Mastery Categorization
```sql
-- Questions mastered (3+ consecutive easy answers)
WITH recent_answers AS (
  SELECT
    question_id,
    difficulty,
    answered_at,
    ROW_NUMBER() OVER (PARTITION BY question_id ORDER BY answered_at DESC) as rn
  FROM answer_logs
)
SELECT
  q.id,
  q.question_text,
  q.answer_count,
  q.last_difficulty,
  CASE
    WHEN (
      SELECT COUNT(*)
      FROM recent_answers ra
      WHERE ra.question_id = q.id
        AND ra.rn <= 3
        AND ra.difficulty = 'easy'
    ) = 3 THEN 'mastered'
    WHEN q.last_difficulty = 'hard' THEN 'needs_review'
    WHEN q.answer_count > 0 THEN 'in_progress'
    ELSE 'not_started'
  END as mastery_status
FROM questions q
```

#### Query 4: Study Streak Calculation
```sql
WITH daily_activity AS (
  SELECT DISTINCT DATE(answered_at) as study_date
  FROM answer_logs
  ORDER BY study_date DESC
),
date_gaps AS (
  SELECT
    study_date,
    JULIANDAY(study_date) - JULIANDAY(LAG(study_date) OVER (ORDER BY study_date DESC)) as day_gap
  FROM daily_activity
)
SELECT
  study_date,
  day_gap,
  SUM(CASE WHEN day_gap IS NULL OR day_gap = -1 THEN 0 ELSE 1 END)
    OVER (ORDER BY study_date DESC) as streak_break
FROM date_gaps
-- Current streak is COUNT of rows where streak_break = 0
```

#### Query 5: Questions Needing Review
```sql
SELECT
  q.id,
  q.question_text,
  q.last_answered_at,
  q.last_difficulty,
  q.answer_count,
  JULIANDAY('now') - JULIANDAY(q.last_answered_at) as days_since_last_answer
FROM questions q
WHERE
  (q.last_difficulty = 'hard' OR
   JULIANDAY('now') - JULIANDAY(q.last_answered_at) > 7)
  AND q.answer_count > 0
ORDER BY days_since_last_answer DESC, q.last_difficulty DESC
LIMIT 10
```

#### Query 6: Monthly Heatmap Data
```sql
SELECT
  DATE(answered_at) as study_date,
  COUNT(*) as question_count,
  COUNT(DISTINCT question_id) as unique_questions
FROM answer_logs
WHERE answered_at >= DATE('now', '-30 days', 'localtime')
GROUP BY DATE(answered_at)
ORDER BY study_date ASC
```

### 4.2 Derived Metrics (Calculated in Application)

**Study Streak**
- Process daily_activity dates to find consecutive days
- Handle timezone considerations
- Track best streak in user metadata or local storage

**Mastery Percentage**
- `(mastered_count / total_questions) * 100`

**Weekly Comparison**
- Compare current week's total to previous week
- Calculate percentage change

**Average Questions Per Day**
- `total_answers_all_time / days_since_first_answer`

**Confidence Score Per Question**
- Requires analyzing answer_logs history per question
- Weight recent answers more heavily (exponential decay)

---

## 5. Technical Implementation

### 5.1 Backend API Endpoints

#### GET `/api/dashboard/daily-stats`
**Description**: Get comprehensive daily statistics

**Query Parameters**:
- `date` (optional): ISO date string, defaults to today
- `timezone` (optional): User timezone for accurate day calculation

**Response**:
```json
{
  "date": "2025-11-22",
  "today": {
    "total_answers": 15,
    "unique_questions": 12,
    "easy_count": 8,
    "medium_count": 5,
    "hard_count": 2,
    "first_answer_at": "2025-11-22T09:15:00Z",
    "last_answer_at": "2025-11-22T17:45:00Z",
    "estimated_study_time_minutes": 45
  },
  "averages": {
    "daily_avg": 12.5,
    "weekly_avg": 87.5
  },
  "comparison": {
    "vs_daily_avg": "+20%",
    "vs_yesterday": "+3"
  }
}
```

#### GET `/api/dashboard/activity-trend`
**Description**: Get activity data for time-series visualization

**Query Parameters**:
- `range` (optional): "7d", "30d", "90d", defaults to "7d"
- `timezone` (optional): User timezone

**Response**:
```json
{
  "range": "7d",
  "data": [
    {
      "date": "2025-11-16",
      "total_answers": 10,
      "unique_questions": 8,
      "easy_count": 5,
      "medium_count": 3,
      "hard_count": 2
    },
    // ... more days
  ]
}
```

#### GET `/api/dashboard/mastery-progress`
**Description**: Get mastery categorization of all questions

**Response**:
```json
{
  "total_questions": 150,
  "mastered": {
    "count": 45,
    "percentage": 30.0,
    "questions": [
      {
        "id": "abc123",
        "question_text": "Explain closures in JavaScript",
        "consecutive_easy_count": 5
      }
      // ... (optionally include question list)
    ]
  },
  "in_progress": {
    "count": 60,
    "percentage": 40.0
  },
  "needs_review": {
    "count": 20,
    "percentage": 13.3
  },
  "not_started": {
    "count": 25,
    "percentage": 16.7
  }
}
```

#### GET `/api/dashboard/study-streak`
**Description**: Calculate current and historical study streaks

**Response**:
```json
{
  "current_streak": 3,
  "longest_streak": 12,
  "streak_at_risk": false,
  "hours_since_last_study": 14,
  "days_studied_this_month": 18,
  "days_studied_all_time": 87
}
```

#### GET `/api/dashboard/review-queue`
**Description**: Get questions that need review

**Query Parameters**:
- `limit` (optional): Number of questions to return, defaults to 10
- `days_threshold` (optional): Days since last answer, defaults to 7

**Response**:
```json
{
  "questions": [
    {
      "id": "abc123",
      "question_text": "Explain JavaScript closures and their use cases",
      "last_answered_at": "2025-11-10T15:30:00Z",
      "days_since_last_answer": 12,
      "last_difficulty": "hard",
      "answer_count": 3,
      "reason": "last_marked_hard"
    },
    // ... more questions
  ],
  "total_count": 23
}
```

#### GET `/api/dashboard/heatmap`
**Description**: Get activity heatmap data

**Query Parameters**:
- `range` (optional): "30d", "90d", "1y", defaults to "30d"
- `timezone` (optional): User timezone

**Response**:
```json
{
  "range": "30d",
  "data": [
    {
      "date": "2025-11-22",
      "question_count": 15,
      "unique_questions": 12,
      "intensity": 3
    },
    // ... all dates in range (including 0s)
  ]
}
```

### 5.2 Frontend Implementation

#### Technology Stack
- **Framework**: Next.js 15 (App Router)
- **UI Components**: Shadcn UI + Tailwind CSS (existing)
- **Charts**: Recharts or Chart.js
- **State Management**: React hooks + SWR for data fetching
- **Date Handling**: date-fns or Day.js

#### Component Structure
```
/frontend/app/dashboard/
├── page.tsx                    # Main dashboard page
├── components/
│   ├── DailyStatsCards.tsx     # Summary cards row
│   ├── ActivityChart.tsx       # 7-day activity bar chart
│   ├── MasteryProgress.tsx     # Donut chart + stats
│   ├── PerformanceTrend.tsx    # Difficulty trend line chart
│   ├── ReviewQueue.tsx         # Questions needing review
│   ├── StudyHeatmap.tsx        # Calendar heatmap
│   └── StudyStreak.tsx         # Streak display component
├── hooks/
│   ├── useDashboardData.ts     # SWR hook for all dashboard data
│   └── useDateRange.ts         # Date range selection logic
└── utils/
    ├── chartConfig.ts          # Chart styling/config
    └── metrics.ts              # Metric calculation helpers
```

#### Data Fetching Strategy
```typescript
// Using SWR for efficient data fetching with caching
import useSWR from 'swr';

export function useDashboardData(dateRange: string = '7d') {
  const { data: dailyStats } = useSWR('/api/dashboard/daily-stats');
  const { data: activityTrend } = useSWR(`/api/dashboard/activity-trend?range=${dateRange}`);
  const { data: masteryProgress } = useSWR('/api/dashboard/mastery-progress');
  const { data: studyStreak } = useSWR('/api/dashboard/study-streak');
  const { data: reviewQueue } = useSWR('/api/dashboard/review-queue?limit=5');
  const { data: heatmapData } = useSWR('/api/dashboard/heatmap?range=30d');

  return {
    dailyStats,
    activityTrend,
    masteryProgress,
    studyStreak,
    reviewQueue,
    heatmapData,
    isLoading: !dailyStats || !activityTrend // etc.
  };
}
```

#### Responsive Design
- **Desktop**: Full dashboard with all components visible
- **Tablet**: Two-column layout, collapsible sections
- **Mobile**: Single column, cards stack vertically, simplified charts

### 5.3 Performance Considerations

**Database Optimization**
- Leverage existing indexes on `answered_at` and `question_id`
- Consider adding composite index: `(answered_at DESC, question_id)` for trend queries
- Cache streak calculations (expensive consecutive date logic)
- Materialize mastery status if query becomes slow (add column to questions table)

**Frontend Optimization**
- Use SWR caching to avoid redundant API calls
- Implement pagination for review queue
- Lazy load charts (use Suspense boundaries)
- Debounce date range changes
- Use React.memo for expensive chart re-renders

**Caching Strategy**
- Cache dashboard data for 5 minutes (reasonable freshness)
- Invalidate cache on new answer submission
- Use stale-while-revalidate pattern for better UX

---

## 6. User Experience Enhancements

### 6.1 Interactivity

**Chart Interactions**
- Click on bar chart day → navigate to that day's questions
- Click on "Needs Review" question → open study session for that question
- Hover on heatmap cell → tooltip with detailed stats

**Quick Actions**
- "Start Study Session" → direct to `/study` page
- "Review Hard Questions" → filtered study session (only hard questions)
- "Continue Streak" → prominent if last study >20 hours ago

### 6.2 Motivational Elements

**Achievements/Badges**
- "Week Warrior": 7-day streak
- "Century Club": 100 questions mastered
- "Consistency King": 30 days studied in a month
- "Hard Mode": 50 hard questions completed

**Progress Feedback**
- Congratulatory message for new personal bests
- Encouraging message when approaching milestones
- Reminder when streak is at risk (>20 hours since last study)

### 6.3 Personalization

**Goal Setting**
- Set daily question goal (e.g., "Answer 15 questions/day")
- Progress ring shows completion toward daily goal
- Notifications when goal achieved

**Focus Areas**
- Tag questions by topic (e.g., "closures", "async", "DOM")
- Dashboard shows topic distribution
- Identify weak topics (high % of hard answers)

---

## 7. Implementation Phases

### Phase 1: Core Dashboard (MVP)
**Timeline**: 1-2 weeks

**Features**:
- Daily stats summary cards
- 7-day activity bar chart
- Basic mastery progress (counts only)
- Study streak calculation
- Review queue list

**Technical**:
- Create 3-4 core API endpoints
- Build basic frontend page with placeholder data
- Implement SWR data fetching
- Add simple styling with existing UI components

### Phase 2: Advanced Visualizations
**Timeline**: 1 week

**Features**:
- Performance trend line chart
- Study heatmap (30-day calendar view)
- Enhanced mastery progress with donut chart
- Responsive design for mobile/tablet

**Technical**:
- Integrate charting library (Recharts)
- Optimize complex SQL queries
- Add loading states and error handling
- Implement date range selector

### Phase 3: Personalization & Motivation
**Timeline**: 1 week

**Features**:
- Daily goal setting
- Achievement badges
- Export progress reports
- Topic tagging and analysis
- Advanced filtering options

**Technical**:
- Extend database schema (goals, achievements)
- Build PDF export functionality
- Add user preferences API
- Implement local storage for preferences

---

## 8. Testing Requirements

### 8.1 Unit Tests

**Backend**
- Test each SQL query with various date ranges
- Test streak calculation logic with edge cases (gaps, timezone changes)
- Test mastery categorization algorithm
- Verify correct percentage calculations

**Frontend**
- Test chart data transformation functions
- Test date range selection logic
- Test metric calculation helpers
- Verify responsive breakpoints

### 8.2 Integration Tests

- Test full API endpoint responses
- Test data flow from database → API → frontend
- Test cache invalidation on new answers
- Test error states (no data, network errors)

### 8.3 User Acceptance Testing

**Scenarios**:
1. New user with no data (graceful empty states)
2. User with 1 day of data (minimal charts)
3. User with >30 days of data (full dashboard)
4. User with active streak vs. broken streak
5. Various screen sizes (mobile, tablet, desktop)

---

## 9. Success Metrics

**Engagement**
- Increase in daily active users
- Increase in average questions answered per session
- Improvement in study streak retention

**User Satisfaction**
- Positive feedback on dashboard usefulness
- Frequency of dashboard visits
- Time spent on dashboard page

**Learning Outcomes**
- Increase in mastery rate (questions → mastered)
- Decrease in questions marked "hard" over time
- Improvement in confidence scores

---

## 10. Future Enhancements

### V2 Features
- **Spaced Repetition Algorithm**: Intelligent question scheduling based on forgetting curve
- **Comparison Mode**: Compare your progress to anonymized aggregate data
- **Study Recommendations**: AI-suggested study focus areas
- **Social Features**: Share progress with study groups
- **Mobile App**: Native iOS/Android dashboard
- **Notifications**: Reminder to study, streak at risk alerts
- **Data Export**: Detailed analytics export for power users
- **Custom Reports**: User-defined metric tracking

### Advanced Analytics
- Question difficulty calibration (community difficulty vs. personal difficulty)
- Learning velocity predictions
- Optimal study time recommendations (based on personal performance patterns)
- Topic correlation analysis (which topics you learn together)

---

## 11. Appendix

### A. Design References
- Duolingo dashboard (streak visualization)
- GitHub contribution graph (heatmap design)
- Khan Academy progress tracker (mastery levels)
- Anki desktop stats page (performance metrics)

### B. Color Scheme
- **Easy**: Green (#10B981)
- **Medium**: Yellow (#F59E0B)
- **Hard**: Red (#EF4444)
- **Mastered**: Dark Green (#059669)
- **In Progress**: Blue (#3B82F6)
- **Not Started**: Gray (#9CA3AF)

### C. Accessibility
- Ensure all charts have text alternatives
- Use colorblind-friendly palette
- Keyboard navigation support
- Screen reader compatible
- WCAG 2.1 Level AA compliance

---

## Document Version
- **Version**: 1.0
- **Date**: 2025-11-22
- **Author**: Claude
- **Status**: Draft for Review
