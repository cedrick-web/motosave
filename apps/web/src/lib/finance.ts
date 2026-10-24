export function calculateGoalProgress(trackedAmount: number, targetAmount: number): number {
  if (!Number.isFinite(trackedAmount) || !Number.isFinite(targetAmount) || targetAmount <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((trackedAmount / targetAmount) * 100)));
}
