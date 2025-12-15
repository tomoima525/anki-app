"use client";

import { useDashboardData } from "./hooks/useDashboardData";
import { DailyStatsCards } from "./components/DailyStatsCards";
import { ActivityChart } from "./components/ActivityChart";
import { MasteryProgress } from "./components/MasteryProgress";
import { ReviewQueue } from "./components/ReviewQueue";
import AuthGuard from "@/components/AuthGuard";
import Link from "next/link";

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardPageContent />
    </AuthGuard>
  );
}

function DashboardPageContent() {
  const {
    dailyStats,
    activityTrend,
    masteryProgress,
    studyStreak,
    reviewQueue,
    isLoading,
    error,
  } = useDashboardData("7d");

  // Calculate weekly total and change
  const weeklyTotal = activityTrend?.data.reduce((sum, d) => sum + d.total_answers, 0) || 0;

  // For weekly change, we'll compare current week to previous week
  // This is a simplified calculation - in production you'd fetch last week's data
  const weeklyChange = dailyStats?.averages.weekly_avg
    ? ((weeklyTotal - dailyStats.averages.weekly_avg) / dailyStats.averages.weekly_avg) * 100
    : 0;

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-2xl w-full mx-auto p-6">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-gray-600 mt-1">Track your learning progress</p>
          </div>
          <nav className="flex gap-4">
            <Link
              href="/study"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Start Study Session
            </Link>
            <Link
              href="/questions"
              className="px-4 py-2 text-blue-600 hover:text-blue-800 font-medium"
            >
              All Questions
            </Link>
          </nav>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <div className="text-gray-600">Loading dashboard...</div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Cards */}
            <DailyStatsCards
              dailyStats={dailyStats}
              studyStreak={studyStreak}
              weeklyTotal={weeklyTotal}
              weeklyChange={weeklyChange}
            />

            {/* Activity Chart */}
            {activityTrend && activityTrend.data.length > 0 && (
              <ActivityChart data={activityTrend.data} />
            )}

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Mastery Progress */}
              <MasteryProgress data={masteryProgress} />

              {/* Review Queue */}
              <ReviewQueue data={reviewQueue} />
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
              <div className="flex flex-wrap gap-4">
                <Link
                  href="/study"
                  className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 font-medium"
                >
                  Start Study Session
                </Link>
                <Link
                  href="/questions?difficulty=hard"
                  className="px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium"
                >
                  Review Hard Questions
                </Link>
                <Link
                  href="/questions"
                  className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium"
                >
                  Browse All Questions
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
