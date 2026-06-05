export const ACTIVITY_PROGRESS_SAVE_KEY = 'hbcc:legacy-activity-progress:v1';
export const ACTIVITY_PENDING_TASK_SAVE_KEY = 'hbcc:legacy-activity-pending-task:v1';

export interface PendingActivityTask {
  readonly activityId: string;
  readonly taskId: string;
  readonly target: 'bath_center' | 'home';
}

export function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function readActivityProgressToday(): Record<string, string[]> {
  try {
    const raw = globalThis.localStorage?.getItem(ACTIVITY_PROGRESS_SAVE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { date?: string; progress?: Record<string, string[]> };
    if (parsed.date !== todayKey() || !parsed.progress) return {};
    return parsed.progress;
  } catch {
    return {};
  }
}

export function writeActivityProgressToday(progress: Record<string, string[]>): void {
  try {
    globalThis.localStorage?.setItem(
      ACTIVITY_PROGRESS_SAVE_KEY,
      JSON.stringify({ date: todayKey(), progress }),
    );
  } catch {
    // Ignore private browsing storage failures.
  }
}

export function completeActivityTask(activityId: string, taskId: string): boolean {
  const progress = readActivityProgressToday();
  const current = new Set(progress[activityId] ?? []);
  if (current.has(taskId)) return false;
  current.add(taskId);
  progress[activityId] = [...current];
  writeActivityProgressToday(progress);
  return true;
}

export function setPendingActivityTask(task: PendingActivityTask): void {
  try {
    globalThis.localStorage?.setItem(
      ACTIVITY_PENDING_TASK_SAVE_KEY,
      JSON.stringify({ date: todayKey(), ...task }),
    );
  } catch {
    // Ignore private browsing storage failures.
  }
}

export function consumePendingActivityTask(
  target: PendingActivityTask['target'],
): PendingActivityTask | null {
  try {
    const raw = globalThis.localStorage?.getItem(ACTIVITY_PENDING_TASK_SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingActivityTask & { date?: string };
    if (parsed.date !== todayKey() || parsed.target !== target) return null;
    globalThis.localStorage?.removeItem(ACTIVITY_PENDING_TASK_SAVE_KEY);
    return {
      activityId: parsed.activityId,
      taskId: parsed.taskId,
      target: parsed.target,
    };
  } catch {
    return null;
  }
}
