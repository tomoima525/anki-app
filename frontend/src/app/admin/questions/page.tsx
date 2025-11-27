'use client'

import { useState, useEffect } from 'react'

interface Question {
  id: string
  question_text: string
  answer_text: string
  source: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export default function AdminQuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('recent')
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'

  useEffect(() => {
    fetchQuestions()
  }, [sortBy, searchTerm])

  async function fetchQuestions() {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        sort: sortBy,
        limit: '100',
      })
      if (searchTerm) {
        params.set('search', searchTerm)
      }

      const res = await fetch(`${apiUrl}/api/questions?${params}`, {
        credentials: 'include',
      })

      if (!res.ok) {
        throw new Error('Failed to fetch questions')
      }

      const data = await res.json()
      setQuestions(data.questions || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load questions')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(questionId: string) {
    try {
      const res = await fetch(`${apiUrl}/api/questions/${questionId}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!res.ok) {
        throw new Error('Failed to delete question')
      }

      setQuestions(questions.filter((q) => q.id !== questionId))
      setShowDeleteConfirm(false)
      setSelectedQuestion(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete question')
    }
  }

  function confirmDelete(question: Question) {
    setSelectedQuestion(question)
    setShowDeleteConfirm(true)
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <p className="text-gray-600">Loading questions...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <p className="text-red-600">Error: {error}</p>
        <button
          onClick={fetchQuestions}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Questions Management
        </h2>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <input
            type="text"
            placeholder="Search questions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="recent">Most Recent</option>
            <option value="oldest">Oldest First</option>
            <option value="most_answered">Most Answered</option>
            <option value="least_answered">Least Answered</option>
          </select>
        </div>

        <div className="mt-4 text-sm text-gray-600">
          Showing {questions.length} questions
        </div>
      </div>

      {/* Questions List */}
      <div className="space-y-4">
        {questions.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-6 text-center">
            <p className="text-gray-600">No questions found</p>
          </div>
        ) : (
          questions.map((question) => (
            <div
              key={question.id}
              className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {question.question_text}
                  </h3>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>
                      <span className="font-medium">Source:</span>{' '}
                      {question.source}
                    </p>
                    <p>
                      <span className="font-medium">Created:</span>{' '}
                      {new Date(question.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => confirmDelete(question)}
                  className="ml-4 px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors"
                >
                  Delete
                </button>
              </div>

              {/* Expandable Answer */}
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-700">
                  View Answer
                </summary>
                <div className="mt-3 p-4 bg-gray-50 rounded-md text-sm text-gray-700 whitespace-pre-wrap">
                  {question.answer_text}
                </div>
              </details>
            </div>
          ))
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedQuestion && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Confirm Deletion
            </h3>
            <p className="text-gray-700 mb-2">
              Are you sure you want to delete this question?
            </p>
            <p className="text-sm text-gray-600 mb-6 font-medium">
              {selectedQuestion.question_text}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false)
                  setSelectedQuestion(null)
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(selectedQuestion.id)}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
