"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

interface ReviewQuestion {
  id: string;
  question_text: string;
  last_answered_at: string | null;
  days_since_last_answer: number;
  last_difficulty: string | null;
  answer_count: number;
  reason: string;
}

interface ReviewQueueProps {
  data: {
    questions: ReviewQuestion[];
    total_count: number;
  } | null;
}

export function ReviewQueue({ data }: ReviewQueueProps) {
  if (!data || data.questions.length === 0) {
    return (
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">🔍 Needs Review</h2>
        <p className="text-gray-500">No questions need review at the moment!</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">
          🔍 Needs Review ({data.total_count} questions)
        </h2>
        <Link
          href="/questions"
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          View All →
        </Link>
      </div>
      <div className="space-y-3">
        {data.questions.map((question) => (
          <div
            key={question.id}
            className="flex items-start justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900 line-clamp-2">
                {question.question_text}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-500">
                  {question.days_since_last_answer} days ago
                </span>
                {question.last_difficulty === "hard" && (
                  <Badge variant="destructive" className="text-xs">
                    Hard
                  </Badge>
                )}
              </div>
            </div>
            <Link
              href={`/questions/${question.id}`}
              className="ml-4 text-xs text-blue-600 hover:text-blue-800 whitespace-nowrap"
            >
              Review →
            </Link>
          </div>
        ))}
      </div>
    </Card>
  );
}
