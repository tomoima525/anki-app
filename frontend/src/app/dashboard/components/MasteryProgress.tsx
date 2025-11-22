"use client";

import { Card } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface MasteryProgressProps {
  data: {
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
  } | null;
}

const COLORS = {
  mastered: "#059669",
  in_progress: "#3B82F6",
  needs_review: "#EF4444",
  not_started: "#9CA3AF",
};

export function MasteryProgress({ data }: MasteryProgressProps) {
  if (!data) {
    return (
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">🎯 Mastery Progress</h2>
        <p className="text-gray-500">No data available</p>
      </Card>
    );
  }

  const chartData = [
    { name: "Mastered", value: data.mastered.count, color: COLORS.mastered },
    { name: "In Progress", value: data.in_progress.count, color: COLORS.in_progress },
    { name: "Needs Review", value: data.needs_review.count, color: COLORS.needs_review },
    { name: "Not Started", value: data.not_started.count, color: COLORS.not_started },
  ];

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold mb-4">🎯 Mastery Progress</h2>
      <div className="flex flex-col md:flex-row items-center gap-6">
        {/* Chart */}
        <div className="w-full md:w-1/2">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Stats */}
        <div className="w-full md:w-1/2 space-y-3">
          <div className="flex justify-between items-center">
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.mastered }}></span>
              <span className="text-sm">Mastered</span>
            </span>
            <span className="font-semibold">
              {data.mastered.count} ({data.mastered.percentage.toFixed(0)}%)
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.in_progress }}></span>
              <span className="text-sm">In Progress</span>
            </span>
            <span className="font-semibold">
              {data.in_progress.count} ({data.in_progress.percentage.toFixed(0)}%)
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.needs_review }}></span>
              <span className="text-sm">Needs Review</span>
            </span>
            <span className="font-semibold">
              {data.needs_review.count} ({data.needs_review.percentage.toFixed(0)}%)
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.not_started }}></span>
              <span className="text-sm">Not Started</span>
            </span>
            <span className="font-semibold">
              {data.not_started.count} ({data.not_started.percentage.toFixed(0)}%)
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
