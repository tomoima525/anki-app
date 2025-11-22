"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface QuestionData {
  id: string;
  question: string;
  answer?: string;
  source: string;
}

type Difficulty = "easy" | "medium" | "hard";

export default function StudyPage() {
  const router = useRouter();
  const [question, setQuestion] = useState<QuestionData | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load first question on mount
  useEffect(() => {
    loadNextQuestion();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (loading) return;

      // Space or Enter to show answer
      if (!showAnswer && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        handleShowAnswer();
      }

      // Number keys for difficulty
      if (showAnswer) {
        if (e.key === "1") handleDifficulty("easy");
        if (e.key === "2") handleDifficulty("medium");
        if (e.key === "3") handleDifficulty("hard");
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [showAnswer, loading, question]);

  const loadNextQuestion = async () => {
    setLoading(true);
    setError(null);
    setShowAnswer(false);

    try {
      // Call backend API (configure BACKEND_URL in .env)
      const backendUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8787";
      const response = await fetch(`${backendUrl}/api/study/next`, {
        method: "POST",
        credentials: "include", // Send cookies for auth
      });

      if (!response.ok) {
        if (response.status === 404) {
          setError("No questions available. Please sync questions first.");
          return;
        }
        throw new Error("Failed to load question");
      }

      const data = await response.json();
      setQuestion(data);
    } catch (err) {
      setError("Failed to load question. Please try again.");
      console.error("Load question error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleShowAnswer = async () => {
    if (!question) return;

    try {
      const backendUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8787";
      const response = await fetch(`${backendUrl}/api/study/${question.id}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to load answer");
      }

      const data = await response.json();
      setQuestion(data);
      setShowAnswer(true);
    } catch (err) {
      setError("Failed to load answer. Please try again.");
      console.error("Load answer error:", err);
    }
  };

  const handleDifficulty = async (difficulty: Difficulty) => {
    if (!question) return;

    setLoading(true);

    try {
      const backendUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8787";
      const response = await fetch(
        `${backendUrl}/api/study/${question.id}/answer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ difficulty }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to submit answer");
      }

      // Load next question
      await loadNextQuestion();
    } catch (err) {
      setError("Failed to submit answer. Please try again.");
      console.error("Submit answer error:", err);
      setLoading(false);
    }
  };

  if (error && !question) {
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
      <div className="max-w-3xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Study Session</h1>
          <nav className="space-x-4">
            <a href="/dashboard" className="text-blue-600 hover:text-blue-800">
              Dashboard
            </a>
            <a href="/questions" className="text-blue-600 hover:text-blue-800">
              All Questions
            </a>
          </nav>
        </div>

        {/* Keyboard shortcuts hint */}
        <div className="mb-4 text-sm text-gray-500 text-center">
          {!showAnswer ? (
            <p>Press Space or Enter to show answer</p>
          ) : (
            <p>Press 1 (Easy), 2 (Medium), or 3 (Hard)</p>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Question card */}
        {loading && !question ? (
          <div className="text-center py-12">
            <div className="text-gray-600">Loading question...</div>
          </div>
        ) : question ? (
          <div className="bg-white rounded-lg shadow-lg p-8">
            {/* Source */}
            <div className="text-sm text-gray-500 mb-4">
              Source: {question.source.split("/").pop()}
            </div>

            {/* Question */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4 text-gray-800">
                Question:
              </h2>
              <p className="text-lg leading-relaxed whitespace-pre-wrap">
                {question.question}
              </p>
            </div>

            {/* Show Answer Button */}
            {!showAnswer ? (
              <div className="flex justify-center">
                <button
                  onClick={handleShowAnswer}
                  className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 text-lg font-medium"
                >
                  Show Answer
                </button>
              </div>
            ) : (
              <>
                {/* Answer */}
                <div className="mb-8 pt-8 border-t border-gray-200">
                  <h2 className="text-xl font-semibold mb-4 text-gray-800">
                    Answer:
                  </h2>
                  <div className="text-lg leading-relaxed whitespace-pre-wrap prose max-w-none">
                    {question.answer}
                  </div>
                </div>

                {/* Difficulty Buttons */}
                <div className="pt-6 border-t border-gray-200">
                  <p className="text-center text-gray-600 mb-4">
                    How difficult was this question?
                  </p>
                  <div className="flex gap-4 justify-center">
                    <button
                      onClick={() => handleDifficulty("easy")}
                      disabled={loading}
                      className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                      Easy
                    </button>
                    <button
                      onClick={() => handleDifficulty("medium")}
                      disabled={loading}
                      className="px-6 py-3 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                      Medium
                    </button>
                    <button
                      onClick={() => handleDifficulty("hard")}
                      disabled={loading}
                      className="px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                      Hard
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
