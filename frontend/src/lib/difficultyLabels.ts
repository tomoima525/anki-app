/**
 * Map internal difficulty values to user-facing labels
 */
export type DifficultyValue = "easy" | "medium" | "hard";

export type DifficultyLabel = "Easy" | "Good" | "Again";

/**
 * Maps internal difficulty values to display labels
 */
export const difficultyLabels: Record<DifficultyValue, DifficultyLabel> = {
  easy: "Easy",
  medium: "Good",
  hard: "Again",
};

/**
 * Get the display label for a difficulty value
 */
export function getDifficultyLabel(difficulty: DifficultyValue): DifficultyLabel {
  return difficultyLabels[difficulty];
}
