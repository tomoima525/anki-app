/**
 * Dashboard data functions
 * Provides database queries and calculations for dashboard metrics
 */

import type { Question, AnswerLog } from "../types/database";

/**
 * Daily activity stats interface
 */
export interface DailyStats {
  total_answers: number;
  unique_questions: number;
  easy_count: number;
  medium_count: number;
  hard_count: number;
  first_answer_at: string | null;
  last_answer_at: string | null;
}

/**
 * Activity trend data point
 */
export interface ActivityDataPoint {
  date: string;
  total_answers: number;
  unique_questions: number;
  easy_count: number;
  medium_count: number;
  hard_count: number;
}

/**
 * Mastery status categorization
 */
export interface MasteryProgress {
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

/**
 * Study streak information
 */
export interface StudyStreak {
  current_streak: number;
  longest_streak: number;
  streak_at_risk: boolean;
  hours_since_last_study: number;
  days_studied_this_month: number;
  days_studied_all_time: number;
}

/**
 * Question needing review
 */
export interface ReviewQuestion {
  id: string;
  question_text: string;
  last_answered_at: string | null;
  days_since_last_answer: number;
  last_difficulty: string | null;
  answer_count: number;
  reason: string;
}

/**
 * Heatmap data point
 */
export interface HeatmapDataPoint {
  date: string;
  question_count: number;
  unique_questions: number;
  intensity: number;
}

/**
 * Get daily activity statistics for a specific date and user
 */
export async function getDailyStats(
  db: D1Database,
  userId: string,
  date?: string
): Promise<DailyStats> {
  const targetDate = date || new Date().toISOString().split("T")[0];

  const result = await db
    .prepare(
      `SELECT
        COUNT(*) as total_answers,
        COUNT(DISTINCT question_id) as unique_questions,
        SUM(CASE WHEN difficulty = 'easy' THEN 1 ELSE 0 END) as easy_count,
        SUM(CASE WHEN difficulty = 'medium' THEN 1 ELSE 0 END) as medium_count,
        SUM(CASE WHEN difficulty = 'hard' THEN 1 ELSE 0 END) as hard_count,
        MIN(answered_at) as first_answer_at,
        MAX(answered_at) as last_answer_at
      FROM answer_logs
      WHERE user_id = ? AND DATE(answered_at) = ?`
    )
    .bind(userId, targetDate)
    .first<DailyStats>();

  return (
    result || {
      total_answers: 0,
      unique_questions: 0,
      easy_count: 0,
      medium_count: 0,
      hard_count: 0,
      first_answer_at: null,
      last_answer_at: null,
    }
  );
}

/**
 * Get activity trend data for a date range and user
 */
export async function getActivityTrend(
  db: D1Database,
  userId: string,
  days: number = 7
): Promise<ActivityDataPoint[]> {
  const result = await db
    .prepare(
      `SELECT
        DATE(answered_at) as date,
        COUNT(*) as total_answers,
        COUNT(DISTINCT question_id) as unique_questions,
        SUM(CASE WHEN difficulty = 'easy' THEN 1 ELSE 0 END) as easy_count,
        SUM(CASE WHEN difficulty = 'medium' THEN 1 ELSE 0 END) as medium_count,
        SUM(CASE WHEN difficulty = 'hard' THEN 1 ELSE 0 END) as hard_count
      FROM answer_logs
      WHERE user_id = ? AND answered_at >= DATE('now', '-' || ? || ' days')
      GROUP BY DATE(answered_at)
      ORDER BY date ASC`
    )
    .bind(userId, days)
    .all<ActivityDataPoint>();

  return result.results || [];
}

/**
 * Get mastery progress categorization for a specific user
 */
export async function getMasteryProgress(
  db: D1Database,
  userId: string
): Promise<MasteryProgress> {
  // Get total questions (shared across all users)
  const totalResult = await db
    .prepare("SELECT COUNT(*) as count FROM questions")
    .first<{ count: number }>();
  const totalQuestions = totalResult?.count || 0;

  // Get questions with 3+ consecutive easy answers (mastered) by this user
  // We'll check the last 3 answers for each question for this specific user
  const masteredResult = await db
    .prepare(
      `SELECT COUNT(*) as count
      FROM user_question_stats uqs
      WHERE uqs.user_id = ?
        AND (
          SELECT COUNT(*)
          FROM (
            SELECT difficulty
            FROM answer_logs
            WHERE question_id = uqs.question_id AND user_id = ?
            ORDER BY answered_at DESC
            LIMIT 3
          ) recent
          WHERE difficulty = 'easy'
        ) = 3
        AND uqs.answer_count >= 3`
    )
    .bind(userId, userId)
    .first<{ count: number }>();
  const masteredCount = masteredResult?.count || 0;

  // Questions marked hard in last attempt by this user
  const needsReviewResult = await db
    .prepare(
      `SELECT COUNT(*) as count
       FROM user_question_stats
       WHERE user_id = ? AND last_difficulty = 'hard' AND answer_count > 0`
    )
    .bind(userId)
    .first<{ count: number }>();
  const needsReviewCount = needsReviewResult?.count || 0;

  // Questions this user has answered at least once
  const answeredResult = await db
    .prepare(
      `SELECT COUNT(*) as count
       FROM user_question_stats
       WHERE user_id = ?`
    )
    .bind(userId)
    .first<{ count: number }>();
  const answeredCount = answeredResult?.count || 0;

  // Questions never attempted by this user
  const notStartedCount = totalQuestions - answeredCount;

  // In progress = answered but not mastered or needs_review
  const inProgressCount =
    answeredCount - masteredCount - needsReviewCount;

  return {
    total_questions: totalQuestions,
    mastered: {
      count: masteredCount,
      percentage: totalQuestions > 0 ? (masteredCount / totalQuestions) * 100 : 0,
    },
    in_progress: {
      count: Math.max(0, inProgressCount),
      percentage: totalQuestions > 0 ? (Math.max(0, inProgressCount) / totalQuestions) * 100 : 0,
    },
    needs_review: {
      count: needsReviewCount,
      percentage: totalQuestions > 0 ? (needsReviewCount / totalQuestions) * 100 : 0,
    },
    not_started: {
      count: notStartedCount,
      percentage: totalQuestions > 0 ? (notStartedCount / totalQuestions) * 100 : 0,
    },
  };
}

/**
 * Calculate study streak for a specific user
 */
export async function getStudyStreak(db: D1Database, userId: string): Promise<StudyStreak> {
  // Get all unique study dates for this user
  const datesResult = await db
    .prepare(
      `SELECT DISTINCT DATE(answered_at) as study_date
      FROM answer_logs
      WHERE user_id = ?
      ORDER BY study_date DESC`
    )
    .bind(userId)
    .all<{ study_date: string }>();

  const studyDates = (datesResult.results || []).map((r) => r.study_date);

  // Calculate current streak
  let currentStreak = 0;
  const today = new Date().toISOString().split("T")[0];
  let checkDate = new Date(today);

  for (const date of studyDates) {
    const dateStr = checkDate.toISOString().split("T")[0];
    if (studyDates.includes(dateStr)) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  // Calculate longest streak
  let longestStreak = 0;
  let tempStreak = 0;
  let prevDate: Date | null = null;

  for (const dateStr of studyDates.reverse()) {
    const currentDate = new Date(dateStr);
    if (prevDate === null) {
      tempStreak = 1;
    } else {
      const dayDiff = Math.floor(
        (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (dayDiff === 1) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    }
    prevDate = currentDate;
  }
  longestStreak = Math.max(longestStreak, tempStreak);

  // Get last study time for this user
  const lastStudyResult = await db
    .prepare(
      "SELECT MAX(answered_at) as last_study FROM answer_logs WHERE user_id = ?"
    )
    .bind(userId)
    .first<{ last_study: string | null }>();

  const lastStudy = lastStudyResult?.last_study;
  let hoursSinceLastStudy = 0;
  if (lastStudy) {
    const lastStudyDate = new Date(lastStudy);
    const now = new Date();
    hoursSinceLastStudy = Math.floor(
      (now.getTime() - lastStudyDate.getTime()) / (1000 * 60 * 60)
    );
  }

  // Days studied this month
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  const firstOfMonthStr = firstOfMonth.toISOString().split("T")[0];
  const thisMonthDates = studyDates.filter((d) => d >= firstOfMonthStr);

  return {
    current_streak: currentStreak,
    longest_streak: longestStreak,
    streak_at_risk: hoursSinceLastStudy > 20,
    hours_since_last_study: hoursSinceLastStudy,
    days_studied_this_month: thisMonthDates.length,
    days_studied_all_time: studyDates.length,
  };
}

/**
 * Get questions that need review for a specific user
 */
export async function getReviewQueue(
  db: D1Database,
  userId: string,
  limit: number = 10,
  daysThreshold: number = 7
): Promise<ReviewQuestion[]> {
  const result = await db
    .prepare(
      `SELECT
        q.id,
        q.question_text,
        uqs.last_answered_at,
        uqs.last_difficulty,
        uqs.answer_count,
        CAST(JULIANDAY('now') - JULIANDAY(uqs.last_answered_at) AS INTEGER) as days_since_last_answer,
        CASE
          WHEN uqs.last_difficulty = 'hard' THEN 'last_marked_hard'
          WHEN JULIANDAY('now') - JULIANDAY(uqs.last_answered_at) > ? THEN 'not_reviewed_recently'
          ELSE 'other'
        END as reason
      FROM user_question_stats uqs
      JOIN questions q ON q.id = uqs.question_id
      WHERE uqs.user_id = ?
        AND uqs.answer_count > 0
        AND (
          uqs.last_difficulty = 'hard' OR
          JULIANDAY('now') - JULIANDAY(uqs.last_answered_at) > ?
        )
      ORDER BY
        CASE WHEN uqs.last_difficulty = 'hard' THEN 0 ELSE 1 END,
        days_since_last_answer DESC
      LIMIT ?`
    )
    .bind(daysThreshold, userId, daysThreshold, limit)
    .all<ReviewQuestion>();

  return result.results || [];
}

/**
 * Get heatmap data for activity visualization for a specific user
 */
export async function getHeatmapData(
  db: D1Database,
  userId: string,
  days: number = 30
): Promise<HeatmapDataPoint[]> {
  const result = await db
    .prepare(
      `SELECT
        DATE(answered_at) as date,
        COUNT(*) as question_count,
        COUNT(DISTINCT question_id) as unique_questions
      FROM answer_logs
      WHERE user_id = ? AND answered_at >= DATE('now', '-' || ? || ' days')
      GROUP BY DATE(answered_at)
      ORDER BY date ASC`
    )
    .bind(userId, days)
    .all<{ date: string; question_count: number; unique_questions: number }>();

  const data = result.results || [];

  // Calculate intensity (0-4 scale based on question count)
  return data.map((d) => {
    let intensity = 0;
    if (d.question_count === 0) intensity = 0;
    else if (d.question_count <= 5) intensity = 1;
    else if (d.question_count <= 10) intensity = 2;
    else if (d.question_count <= 15) intensity = 3;
    else intensity = 4;

    return {
      date: d.date,
      question_count: d.question_count,
      unique_questions: d.unique_questions,
      intensity,
    };
  });
}

/**
 * Calculate average questions per day for a specific user
 */
export async function getAverages(db: D1Database, userId: string): Promise<{
  daily_avg: number;
  weekly_avg: number;
}> {
  // Get first answer date for this user
  const firstAnswerResult = await db
    .prepare("SELECT MIN(answered_at) as first_answer FROM answer_logs WHERE user_id = ?")
    .bind(userId)
    .first<{ first_answer: string | null }>();

  const firstAnswer = firstAnswerResult?.first_answer;
  if (!firstAnswer) {
    return { daily_avg: 0, weekly_avg: 0 };
  }

  // Calculate days since first answer
  const firstDate = new Date(firstAnswer);
  const now = new Date();
  const daysSinceFirst = Math.max(
    1,
    Math.floor((now.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24))
  );

  // Get total answers for this user
  const totalResult = await db
    .prepare("SELECT COUNT(*) as count FROM answer_logs WHERE user_id = ?")
    .bind(userId)
    .first<{ count: number }>();
  const totalAnswers = totalResult?.count || 0;

  const dailyAvg = totalAnswers / daysSinceFirst;
  const weeklyAvg = dailyAvg * 7;

  return {
    daily_avg: Math.round(dailyAvg * 10) / 10,
    weekly_avg: Math.round(weeklyAvg * 10) / 10,
  };
}

/**
 * Get yesterday's stats for comparison for a specific user
 */
export async function getYesterdayStats(
  db: D1Database,
  userId: string
): Promise<{ total_answers: number }> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  const result = await db
    .prepare(
      `SELECT COUNT(*) as total_answers
      FROM answer_logs
      WHERE user_id = ? AND DATE(answered_at) = ?`
    )
    .bind(userId, yesterdayStr)
    .first<{ total_answers: number }>();

  return result || { total_answers: 0 };
}
