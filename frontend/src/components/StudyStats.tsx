'use client';

import { useState, useEffect } from 'react';

interface StudyStats {
  total: number;
  easy: number;
  medium: number;
  hard: number;
}

interface StudyStatsProps {
  onRecordAnswer?: (difficulty: 'easy' | 'medium' | 'hard') => void;
}

export default function StudyStats({ onRecordAnswer }: StudyStatsProps) {
  const [stats, setStats] = useState<StudyStats>({
    total: 0,
    easy: 0,
    medium: 0,
    hard: 0,
  });

  // Track stats in session storage
  useEffect(() => {
    const saved = sessionStorage.getItem('study_stats');
    if (saved) {
      setStats(JSON.parse(saved));
    }
  }, []);

  const recordAnswer = (difficulty: 'easy' | 'medium' | 'hard') => {
    setStats(prev => {
      const updated = {
        ...prev,
        total: prev.total + 1,
        [difficulty]: prev[difficulty] + 1,
      };
      sessionStorage.setItem('study_stats', JSON.stringify(updated));
      return updated;
    });
  };

  const resetStats = () => {
    const reset = { total: 0, easy: 0, medium: 0, hard: 0 };
    setStats(reset);
    sessionStorage.setItem('study_stats', JSON.stringify(reset));
  };

  // Expose recordAnswer function to parent
  useEffect(() => {
    if (onRecordAnswer) {
      // This is a bit unconventional but allows the parent to call recordAnswer
      (window as unknown as { recordStudyAnswer?: typeof recordAnswer }).recordStudyAnswer = recordAnswer;
    }
  }, [onRecordAnswer]);

  return (
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-semibold">Session Progress</h3>
        <button
          onClick={resetStats}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Reset
        </button>
      </div>
      <div className="grid grid-cols-4 gap-4 text-center">
        <div>
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-xs text-gray-500">Total</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-green-600">{stats.easy}</div>
          <div className="text-xs text-gray-500">Easy</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-yellow-600">{stats.medium}</div>
          <div className="text-xs text-gray-500">Medium</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-red-600">{stats.hard}</div>
          <div className="text-xs text-gray-500">Hard</div>
        </div>
      </div>
    </div>
  );
}
