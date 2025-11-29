"use client";

import { Card } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { getDifficultyLabel } from "@/lib/difficultyLabels";

interface ActivityDataPoint {
  date: string;
  total_answers: number;
  unique_questions: number;
  easy_count: number;
  medium_count: number;
  hard_count: number;
}

interface ActivityChartProps {
  data: ActivityDataPoint[];
}

export function ActivityChart({ data }: ActivityChartProps) {
  // Format date to show short format (MM/DD)
  const formattedData = data.map((d) => ({
    ...d,
    date: new Date(d.date).toLocaleDateString("en-US", {
      month: "numeric",
      day: "numeric",
    }),
  }));

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold mb-4">📈 Activity Chart (Last 7 Days)</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={formattedData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="easy_count" stackId="a" fill="#10B981" name={getDifficultyLabel("easy")} />
          <Bar dataKey="medium_count" stackId="a" fill="#F59E0B" name={getDifficultyLabel("medium")} />
          <Bar dataKey="hard_count" stackId="a" fill="#EF4444" name={getDifficultyLabel("hard")} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
