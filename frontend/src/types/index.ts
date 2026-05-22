export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  is_active: boolean;
  is_verified: boolean;
  totp_enabled: boolean;
  max_permission_level: number;
  privacy_mode: boolean;
  created_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done" | "cancelled";
  priority: "low" | "medium" | "high" | "urgent";
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: string;
  color: string | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  model_used?: string;
  latency_ms?: number;
}

export interface ChatResponse {
  message: string;
  session_id: string;
  model_used: string;
  latency_ms: number;
  memories_used: number;
}

export type TaskStatus = Task["status"];
export type TaskPriority = Task["priority"];
