'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getDifficultyLabel } from '@/lib/difficultyLabels';

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
    <Card className="mb-4">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg">Session Progress</CardTitle>
          <Button onClick={resetStats} variant="ghost" size="sm">
            Reset
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600">{stats.easy}</div>
            <div className="text-xs text-muted-foreground">{getDifficultyLabel("easy")}</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-yellow-600">{stats.medium}</div>
            <div className="text-xs text-muted-foreground">{getDifficultyLabel("medium")}</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-600">{stats.hard}</div>
            <div className="text-xs text-muted-foreground">{getDifficultyLabel("hard")}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
