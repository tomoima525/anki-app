"use client";

import { useEffect, useState } from "react";

interface DailyStats {
  date: string;
  today: {
    total_answers: number;
    unique_questions: number;
    easy_count: number;
    medium_count: number;
    hard_count: number;
    first_answer_at: string | null;
    last_answer_at: string | null;
    estimated_study_time_minutes: number;
  };
  averages: {
    daily_avg: number;
    weekly_avg: number;
  };
  comparison: {
    vs_daily_avg: string;
    vs_yesterday: string;
  };
}

interface ActivityDataPoint {
  date: string;
  total_answers: number;
  unique_questions: number;
  easy_count: number;
  medium_count: number;
  hard_count: number;
}

interface ActivityTrend {
  range: string;
  data: ActivityDataPoint[];
}

interface MasteryProgress {
  total_questions: number;
  mastered: {
    count: number;
    percentage: number;
  };
  in_progress: {
    count: number;
    percentage: number;
  };
  needs_review: {
    count: number;
    percentage: number;
  };
  not_started: {
    count: number;
    percentage: number;
  };
}

interface StudyStreak {
  current_streak: number;
  longest_streak: number;
  streak_at_risk: boolean;
  hours_since_last_study: number;
  days_studied_this_month: number;
  days_studied_all_time: number;
}

interface ReviewQuestion {
  id: string;
  question_text: string;
  last_answered_at: string | null;
  days_since_last_answer: number;
  last_difficulty: string | null;
  answer_count: number;
  reason: string;
}

interface ReviewQueue {
  questions: ReviewQuestion[];
  total_count: number;
}

interface HeatmapDataPoint {
  date: string;
  question_count: number;
  unique_questions: number;
  intensity: number;
}

interface HeatmapData {
  range: string;
  data: HeatmapDataPoint[];
}

export function useDashboardData(dateRange: string = "7d") {
  const [dailyStats, setDailyStats] = useState<DailyStats | null>(null);
  const [activityTrend, setActivityTrend] = useState<ActivityTrend | null>(null);
  const [masteryProgress, setMasteryProgress] = useState<MasteryProgress | null>(null);
  const [studyStreak, setStudyStreak] = useState<StudyStreak | null>(null);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueue | null>(null);
  const [heatmapData, setHeatmapData] = useState<HeatmapData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8787";

  useEffect(() => {
    async function fetchDashboardData() {
      setIsLoading(true);
      setError(null);

      try {
        const [
          dailyStatsRes,
          activityTrendRes,
          masteryProgressRes,
          studyStreakRes,
          reviewQueueRes,
          heatmapRes,
        ] = await Promise.all([
          fetch(`${backendUrl}/api/dashboard/daily-stats`, { credentials: "include" }),
          fetch(`${backendUrl}/api/dashboard/activity-trend?range=${dateRange}`, { credentials: "include" }),
          fetch(`${backendUrl}/api/dashboard/mastery-progress`, { credentials: "include" }),
          fetch(`${backendUrl}/api/dashboard/study-streak`, { credentials: "include" }),
          fetch(`${backendUrl}/api/dashboard/review-queue?limit=5`, { credentials: "include" }),
          fetch(`${backendUrl}/api/dashboard/heatmap?range=30d`, { credentials: "include" }),
        ]);

        if (!dailyStatsRes.ok) throw new Error("Failed to fetch daily stats");
        if (!activityTrendRes.ok) throw new Error("Failed to fetch activity trend");
        if (!masteryProgressRes.ok) throw new Error("Failed to fetch mastery progress");
        if (!studyStreakRes.ok) throw new Error("Failed to fetch study streak");
        if (!reviewQueueRes.ok) throw new Error("Failed to fetch review queue");
        if (!heatmapRes.ok) throw new Error("Failed to fetch heatmap data");

        const [daily, activity, mastery, streak, review, heatmap] = await Promise.all([
          dailyStatsRes.json(),
          activityTrendRes.json(),
          masteryProgressRes.json(),
          studyStreakRes.json(),
          reviewQueueRes.json(),
          heatmapRes.json(),
        ]);

        setDailyStats(daily);
        setActivityTrend(activity);
        setMasteryProgress(mastery);
        setStudyStreak(streak);
        setReviewQueue(review);
        setHeatmapData(heatmap);
      } catch (err) {
        console.error("Error fetching dashboard data:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch dashboard data");
      } finally {
        setIsLoading(false);
      }
    }

    fetchDashboardData();
  }, [dateRange, backendUrl]);

  return {
    dailyStats,
    activityTrend,
    masteryProgress,
    studyStreak,
    reviewQueue,
    heatmapData,
    isLoading,
    error,
  };
}
