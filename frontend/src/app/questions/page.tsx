"use client";

import { useState, useEffect } from "react";
import { Question } from "@/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getDifficultyLabel, type DifficultyValue } from "@/lib/difficultyLabels";
import AuthGuard from "@/components/AuthGuard";

interface QuestionStats {
  totalQuestions: number;
  answeredQuestions: number;
  unansweredQuestions: number;
  difficultyDistribution: {
    easy: number;
    medium: number;
    hard: number;
  };
  recentActivity: number;
}

interface PaginationInfo {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export default function QuestionsPage() {
  return (
    <AuthGuard>
      <QuestionsPageContent />
    </AuthGuard>
  );
}

function QuestionsPageContent() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [stats, setStats] = useState<QuestionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Filters and search
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState<string>("");
  const [sort, setSort] = useState<string>("newest");
  const [pagination, setPagination] = useState<PaginationInfo>({
    total: 0,
    limit: 50,
    offset: 0,
    hasMore: false,
  });

  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8787";

  // Load stats on mount
  useEffect(() => {
    loadStats();
  }, []);

  // Load questions when filters change
  useEffect(() => {
    loadQuestions();
  }, [search, difficulty, sort, pagination.offset]);

  const loadStats = async () => {
    try {
      const response = await fetch(`${backendUrl}/api/questions/stats`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to load stats");
      }

      const data = await response.json();
      setStats(data);
    } catch (err) {
      console.error("Load stats error:", err);
    }
  };

  const loadQuestions = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: pagination.offset.toString(),
      });

      if (search) params.set("search", search);
      if (difficulty) params.set("difficulty", difficulty);
      if (sort) params.set("sort", sort);

      const response = await fetch(`${backendUrl}/api/questions?${params}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to load questions");
      }

      const data = await response.json();
      setQuestions(data.questions);
      setPagination(data.pagination);
    } catch (err) {
      setError("Failed to load questions. Please try again.");
      console.error("Load questions error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    setPagination({ ...pagination, offset: 0 });
  };

  const handleDifficultyFilter = (value: string) => {
    setDifficulty(value);
    setPagination({ ...pagination, offset: 0 });
  };

  const handleSortChange = (value: string) => {
    setSort(value);
    setPagination({ ...pagination, offset: 0 });
  };

  const handleRemove = async (id: string) => {
    // Show confirmation dialog
    if (!confirm("Are you sure you want to delete this question? This action cannot be undone.")) {
      return;
    }

    // Set loading state for this specific question
    setDeletingId(id);
    setError(null); // Clear any previous errors

    try {
      const response = await fetch(`${backendUrl}/api/questions/${id}`, {
        credentials: "include",
        method: "DELETE",
      });

      if (response.ok) {
        // Successfully deleted - update UI
        setQuestions((prev) => prev.filter((v) => v.id !== id));
        setPagination((prev) => ({ ...prev, total: prev.total - 1 }));

        // Reload stats to reflect the deletion
        loadStats();
      } else {
        // Handle error response
        const errorData = await response.json();
        const errorMessage = errorData.error || "Failed to delete question";
        setError(errorMessage);
      }
    } catch (err) {
      console.error("Delete error:", err);
      setError("Failed to delete question. Please try again.");
    } finally {
      setDeletingId(null); // Clear loading state
    }
  };

  const handleNextPage = () => {
    if (pagination.hasMore) {
      setPagination({
        ...pagination,
        offset: pagination.offset + pagination.limit,
      });
    }
  };

  const handlePrevPage = () => {
    if (pagination.offset > 0) {
      setPagination({
        ...pagination,
        offset: Math.max(0, pagination.offset - pagination.limit),
      });
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getDifficultyVariant = (
    difficulty: string | null
  ): "default" | "secondary" | "destructive" | "outline" => {
    switch (difficulty) {
      case "easy":
      case "medium":
        return "secondary";
      case "hard":
        return "destructive";
      default:
        return "outline";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-3xl font-bold">Question Management</h1>
            <nav className="flex gap-2">
              <Button asChild variant="link">
                <a href="/dashboard">Dashboard</a>
              </Button>
              <Button asChild variant="link">
                <a href="/study">Study</a>
              </Button>
              <Button asChild variant="link">
                <a href="/settings">Settings</a>
              </Button>
            </nav>
          </div>

          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">
                    Total Questions
                  </div>
                  <div className="text-2xl font-bold">
                    {stats.totalQuestions}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Answered</div>
                  <div className="text-2xl font-bold text-green-600">
                    {stats.answeredQuestions}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">{getDifficultyLabel("easy")}</div>
                  <div className="text-2xl font-bold text-green-500">
                    {stats.difficultyDistribution.easy}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">{getDifficultyLabel("medium")}</div>
                  <div className="text-2xl font-bold text-yellow-500">
                    {stats.difficultyDistribution.medium}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">{getDifficultyLabel("hard")}</div>
                  <div className="text-2xl font-bold text-red-500">
                    {stats.difficultyDistribution.hard}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Filters and Search */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Search */}
              <div className="space-y-2">
                <Label htmlFor="search">Search</Label>
                <Input
                  id="search"
                  type="text"
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search questions..."
                />
              </div>

              {/* Difficulty Filter */}
              <div className="space-y-2">
                <Label htmlFor="difficulty">Difficulty</Label>
                <select
                  id="difficulty"
                  value={difficulty}
                  onChange={(e) => handleDifficultyFilter(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">All</option>
                  <option value="easy">{getDifficultyLabel("easy")}</option>
                  <option value="medium">{getDifficultyLabel("medium")}</option>
                  <option value="hard">{getDifficultyLabel("hard")}</option>
                </select>
              </div>

              {/* Sort */}
              <div className="space-y-2">
                <Label htmlFor="sort">Sort By</Label>
                <select
                  id="sort"
                  value={sort}
                  onChange={(e) => handleSortChange(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="newest">Newest Questions</option>
                  <option value="recent">Recently Answered</option>
                  <option value="oldest">Least Recently Answered</option>
                  <option value="most_answered">Most Answered</option>
                  <option value="least_answered">Least Answered</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <div className="mb-4 bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md text-sm">
            {error}
          </div>
        )}

        {/* Questions List */}
        <Card>
          {loading ? (
            <div className="text-center py-12">
              <div className="text-gray-600">Loading questions...</div>
            </div>
          ) : questions.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-600">No questions found</div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Question
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Source
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Last Difficulty
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Answer Count
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Last Answered
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {questions.map((question) => (
                      <tr key={question.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900 line-clamp-2">
                            {question.question_text}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-500">
                            {question.source.split("/").pop()}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <Badge
                            variant={getDifficultyVariant(
                              question.last_difficulty
                            )}
                          >
                            {question.last_difficulty
                              ? getDifficultyLabel(question.last_difficulty as DifficultyValue)
                              : "N/A"}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900">
                            {question.answer_count}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-500">
                            {formatDate(question.last_answered_at)}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-2">
                            <Button
                              asChild
                              variant="link"
                              size="sm"
                              className="h-auto p-0"
                            >
                              <a href={`/questions/${question.id}`}>
                                View Details
                              </a>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-auto p-1"
                              onClick={() => handleRemove(question.id)}
                              disabled={deletingId === question.id}
                            >
                              {deletingId === question.id ? "Deleting..." : "Remove"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="px-6 py-4 border-t border-border flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Showing {pagination.offset + 1} to{" "}
                  {Math.min(
                    pagination.offset + pagination.limit,
                    pagination.total
                  )}{" "}
                  of {pagination.total} questions
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handlePrevPage}
                    disabled={pagination.offset === 0}
                    variant="outline"
                    size="sm"
                  >
                    Previous
                  </Button>
                  <Button
                    onClick={handleNextPage}
                    disabled={!pagination.hasMore}
                    variant="outline"
                    size="sm"
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
