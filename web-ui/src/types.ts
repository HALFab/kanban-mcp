export interface Board {
  id: string;
  name: string;
  goal: string;
  landing_column_id: string | null;
  created_at: string;
  updated_at: string;
}

export type Assignee = 'USER' | 'AGENT';

export interface TaskSummary {
  id: string;
  title: string;
  position: number;
  createdAt: string;
  updatedAt: string;
  updateReason?: string;
  assignee: Assignee;
}

export interface ColumnWithTasks {
  id: string;
  name: string;
  position: number;
  wipLimit: number;
  isLanding: boolean;
  tasks: TaskSummary[];
}

export interface Task {
  id: string;
  column_id: string;
  title: string;
  content: string;
  position: number;
  created_at: string;
  updated_at: string;
  update_reason?: string;
  assignee: Assignee;
}
