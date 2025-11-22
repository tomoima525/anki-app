"use client";

import { Card } from "@/components/ui/card";

interface DailyStats {
  today: {
    total_answers: number;
    unique_questions: number;
    easy_count: number;
    medium_count: number;
    hard_count: number;
  };
  comparison: {
    vs_daily_avg: string;
  };
  averages: {
    weekly_avg: number;
  };
}

interface StudyStreak {
  current_streak: number;
  longest_streak: number;
}

interface DailyStatsCardsProps {
  dailyStats: DailyStats | null;
  studyStreak: StudyStreak | null;
  weeklyTotal: number;
  weeklyChange: number;
}

export function DailyStatsCards({
  dailyStats,
  studyStreak,
  weeklyTotal,
  weeklyChange,
}: DailyStatsCardsProps) {
  const todayTotal = dailyStats?.today.total_answers || 0;
  const easyCount = dailyStats?.today.easy_count || 0;
  const mediumCount = dailyStats?.today.medium_count || 0;
  const hardCount = dailyStats?.today.hard_count || 0;
  const currentStreak = studyStreak?.current_streak || 0;
  const longestStreak = studyStreak?.longest_streak || 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Today's Stats */}
      <Card className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">Today&apos;s Stats</p>
            <p className="text-3xl font-bold mt-2">{todayTotal} questions</p>
            <div className="mt-3 flex gap-3 text-sm">
              <span className="text-green-600">{easyCount}E</span>
              <span className="text-yellow-600">{mediumCount}M</span>
              <span className="text-red-600">{hardCount}H</span>
            </div>
            {dailyStats && (
              <p className="text-xs text-gray-500 mt-2">
                {dailyStats.comparison.vs_daily_avg} vs avg
              </p>
            )}
          </div>
          <div className="text-2xl">📝</div>
        </div>
      </Card>

      {/* Study Streak */}
      <Card className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">Study Streak</p>
            <p className="text-3xl font-bold mt-2">
              {currentStreak} days
            </p>
            <p className="text-xs text-gray-500 mt-3">
              Best: {longestStreak} days
            </p>
          </div>
          <div className="text-2xl">🔥</div>
        </div>
      </Card>

      {/* Weekly Volume */}
      <Card className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">Weekly Volume</p>
            <p className="text-3xl font-bold mt-2">{weeklyTotal} total</p>
            <p className="text-xs text-gray-500 mt-3">
              {weeklyChange >= 0 ? "+" : ""}
              {weeklyChange.toFixed(0)}% vs last week
            </p>
          </div>
          <div className="text-2xl">📊</div>
        </div>
      </Card>
    </div>
  );
}
