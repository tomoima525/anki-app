'use client';

export const runtime = 'edge';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Question, AnswerLog } from '@/types/database';

interface QuestionDetail {
  question: Question;
  recentLogs: AnswerLog[];
}

export default function QuestionDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<QuestionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8787';

  useEffect(() => {
    loadQuestion();
  }, [id]);

  const loadQuestion = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${backendUrl}/api/questions/${id}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 404) {
          setError('Question not found');
          return;
        }
        throw new Error('Failed to load question');
      }

      const data = await response.json();
      setData(data);
    } catch (err) {
      setError('Failed to load question. Please try again.');
      console.error('Load question error:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return 'bg-green-100 text-green-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'hard':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center py-12">
            <div className="text-gray-600">Loading question...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-5xl mx-auto px-4">
          <div className="mb-4">
            <a href="/questions" className="text-blue-600 hover:text-blue-800">
              ← Back to Questions
            </a>
          </div>
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error || 'Question not found'}
          </div>
        </div>
      </div>
    );
  }

  const { question, recentLogs } = data;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-5xl mx-auto px-4">
        {/* Header */}
        <div className="mb-6">
          <a href="/questions" className="text-blue-600 hover:text-blue-800">
            ← Back to Questions
          </a>
        </div>

        {/* Question Details */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
          {/* Metadata */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">
                Source: {question.source.split('/').pop()}
              </span>
              {question.last_difficulty && (
                <span
                  className={`px-3 py-1 text-xs font-semibold rounded-full ${getDifficultyColor(
                    question.last_difficulty
                  )}`}
                >
                  {question.last_difficulty}
                </span>
              )}
            </div>
            <div className="text-sm text-gray-500">
              ID: {question.id.slice(0, 8)}...
            </div>
          </div>

          {/* Question */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Question:</h2>
            <p className="text-lg leading-relaxed whitespace-pre-wrap">
              {question.question_text}
            </p>
          </div>

          {/* Answer */}
          <div className="mb-8 pt-6 border-t border-gray-200">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Answer:</h2>
            <div className="text-lg leading-relaxed whitespace-pre-wrap prose max-w-none">
              {question.answer_text}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 pt-6 border-t border-gray-200">
            <div>
              <div className="text-sm text-gray-600">Answer Count</div>
              <div className="text-2xl font-bold">{question.answer_count}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Last Answered</div>
              <div className="text-lg font-medium">
                {formatDate(question.last_answered_at)}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Created</div>
              <div className="text-lg font-medium">{formatDate(question.created_at)}</div>
            </div>
          </div>
        </div>

        {/* Answer History */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-bold mb-6">Answer History</h2>

          {recentLogs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No answer history yet
            </div>
          ) : (
            <div className="space-y-3">
              {recentLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <span
                      className={`px-3 py-1 text-sm font-semibold rounded-full ${getDifficultyColor(
                        log.difficulty
                      )}`}
                    >
                      {log.difficulty}
                    </span>
                    <span className="text-gray-600">
                      {formatDate(log.answered_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {recentLogs.length >= 20 && (
            <div className="mt-4 text-sm text-gray-500 text-center">
              Showing the 20 most recent answers
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
