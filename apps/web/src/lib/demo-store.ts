export type Goal = {
  id: string; title: string; purpose: string; target_amount: number;
  target_date: string | null; contribution_frequency: string; created_at: string;
};
export type Motorcycle = {
  id: string; registration_number: string; make: string; model: string;
  model_year: number | null; vehicle_type: string; is_electric: boolean; created_at: string;
};
export type LoanApplication = {
  id: string; purpose: string; requested_amount: number; term_months: number; status: string; created_at: string;
};
export type SavingsTransaction = {
  id: string; goal_id: string | null; amount: number; note: string | null;
  source: string; verification_status: string; created_at: string;
};
export type Policy = { id: string; policy_number: string; status: string; coverage_end: string; motorcycle_id: string | null };
export type Premium = { id: string; policy_id: string; amount_due: number; due_date: string; status: string };

const now = new Date();
const dateIn = (days: number) => { const d = new Date(now); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };

export const demoGoals: Goal[] = [
  { id: 'demo-goal-1', title: 'Emergency reserve', purpose: 'emergency', target_amount: 500000, target_date: dateIn(120), contribution_frequency: 'weekly', created_at: dateIn(-60) },
  { id: 'demo-goal-2', title: 'Motorcycle maintenance', purpose: 'maintenance', target_amount: 250000, target_date: dateIn(60), contribution_frequency: 'weekly', created_at: dateIn(-35) },
  { id: 'demo-goal-3', title: 'Electric motorcycle deposit', purpose: 'ownership', target_amount: 1800000, target_date: dateIn(365), contribution_frequency: 'monthly', created_at: dateIn(-18) },
];
export const demoTransactions: SavingsTransaction[] = [
  { id: 'demo-tx-1', goal_id: 'demo-goal-1', amount: 15000, note: 'Weekly contribution', source: 'manual', verification_status: 'unverified', created_at: dateIn(-1) },
  { id: 'demo-tx-2', goal_id: 'demo-goal-2', amount: 8000, note: 'Workshop reserve', source: 'manual', verification_status: 'unverified', created_at: dateIn(-3) },
  { id: 'demo-tx-3', goal_id: 'demo-goal-1', amount: 20000, note: 'Weekend contribution', source: 'manual', verification_status: 'unverified', created_at: dateIn(-7) },
];
export const demoMotorcycles: Motorcycle[] = [
  { id: 'demo-bike-1', registration_number: 'RAA 248 X', make: 'TVS', model: 'HLX 125', model_year: 2023, vehicle_type: 'petrol', is_electric: false, created_at: dateIn(-160) },
];
export const demoLoans: LoanApplication[] = [
  { id: 'demo-loan-1', purpose: 'motorcycle_maintenance', requested_amount: 350000, term_months: 6, status: 'under_review', created_at: dateIn(-4) },
];
export const demoPolicies: Policy[] = [
  { id: 'demo-policy-1', policy_number: 'DEMO-MOTO-001', status: 'demo_active', coverage_end: dateIn(24), motorcycle_id: 'demo-bike-1' },
];
export const demoPremiums: Premium[] = [
  { id: 'demo-premium-1', policy_id: 'demo-policy-1', amount_due: 12500, due_date: dateIn(5), status: 'scheduled' },
];
export function readStore<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; }
  catch { return fallback; }
}
