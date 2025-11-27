'use client'

import { useState } from 'react'

interface SyncResult {
  source: string
  inserted?: number
  updated?: number
  skipped?: number
  error?: string
}

export default function AdminSyncPage() {
  const [syncing, setSyncing] = useState(false)
  const [results, setResults] = useState<SyncResult[]>([])
  const [error, setError] = useState<string | null>(null)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'

  async function handleSync() {
    try {
      setSyncing(true)
      setError(null)
      setResults([])

      const res = await fetch(`${apiUrl}/api/sync/github`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to sync questions')
      }

      const data = await res.json()
      setResults(data.results || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync questions')
    } finally {
      setSyncing(false)
    }
  }

  const totalInserted = results.reduce(
    (sum, r) => sum + (r.inserted || 0),
    0
  )
  const totalUpdated = results.reduce(
    (sum, r) => sum + (r.updated || 0),
    0
  )
  const totalSkipped = results.reduce(
    (sum, r) => sum + (r.skipped || 0),
    0
  )

  return (
    <div>
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          GitHub Sync
        </h2>
        <p className="text-gray-600 mb-6">
          Import interview questions from configured GitHub repositories.
          This operation will fetch questions from all configured sources
          and add them to the shared question pool.
        </p>

        <button
          onClick={handleSync}
          disabled={syncing}
          className={`px-6 py-3 rounded-md font-medium transition-colors ${
            syncing
              ? 'bg-gray-400 cursor-not-allowed text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {syncing ? 'Syncing...' : 'Sync Questions from GitHub'}
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <h3 className="text-red-800 font-semibold mb-1">Sync Failed</h3>
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Sync Results */}
      {results.length > 0 && (
        <>
          {/* Summary */}
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Sync Summary
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-600 font-medium mb-1">
                  Inserted
                </p>
                <p className="text-3xl font-bold text-green-800">
                  {totalInserted}
                </p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-600 font-medium mb-1">
                  Updated
                </p>
                <p className="text-3xl font-bold text-blue-800">
                  {totalUpdated}
                </p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-sm text-gray-600 font-medium mb-1">
                  Skipped
                </p>
                <p className="text-3xl font-bold text-gray-800">
                  {totalSkipped}
                </p>
              </div>
            </div>
          </div>

          {/* Details by Source */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Results by Source
            </h3>
            <div className="space-y-3">
              {results.map((result, index) => (
                <div
                  key={index}
                  className={`border rounded-lg p-4 ${
                    result.error
                      ? 'border-red-200 bg-red-50'
                      : 'border-gray-200'
                  }`}
                >
                  <h4 className="font-semibold text-gray-900 mb-2">
                    {result.source}
                  </h4>
                  {result.error ? (
                    <p className="text-sm text-red-700">{result.error}</p>
                  ) : (
                    <div className="text-sm text-gray-700 space-y-1">
                      <p>
                        Inserted: <span className="font-medium">{result.inserted || 0}</span>
                      </p>
                      <p>
                        Updated: <span className="font-medium">{result.updated || 0}</span>
                      </p>
                      <p>
                        Skipped: <span className="font-medium">{result.skipped || 0}</span>
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Info Box */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-blue-900 font-semibold mb-2">
          How GitHub Sync Works
        </h3>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>
            Fetches questions from configured GitHub repository URLs
          </li>
          <li>
            Uses AI to detect if answers are pre-written or need generation
          </li>
          <li>
            Questions are added to the shared pool accessible to all users
          </li>
          <li>
            Existing questions are updated if content has changed
          </li>
          <li>
            Duplicate questions are automatically skipped
          </li>
        </ul>
      </div>
    </div>
  )
}
