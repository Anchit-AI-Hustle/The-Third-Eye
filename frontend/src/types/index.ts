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

export interface ChatSource {
  document_id?: string;
  document_title?: string;
  chunk_index?: number;
  score?: number;
  title?: string;
  url?: string;
}

export interface ChatResponse {
  message: string;
  session_id: string;
  agent_name: string;
  delegated_to?: string | null;
  model_used: string;
  latency_ms: number;
  memories_used: number;
  sources?: ChatSource[];
}

export interface Document {
  id: string;
  user_id: string;
  title: string;
  file_type: string | null;
  file_size_bytes: number | null;
  processing_status: "pending" | "parsing" | "chunking" | "embedding" | "ready" | "failed";
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeSearchResult {
  document_id: string;
  document_title: string;
  chunk_index: number;
  content: string;
  score: number;
}

export interface KnowledgeSearchResponse {
  query: string;
  results: KnowledgeSearchResult[];
  latency_ms: number;
}

export type TaskStatus = Task["status"];
export type TaskPriority = Task["priority"];
