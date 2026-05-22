import axios, { AxiosInstance } from "axios";
import { getSession } from "next-auth/react";
import type {
  Task,
  Project,
  ChatResponse,
  Document,
  KnowledgeSearchResponse,
} from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const session = await getSession();
  if (!session?.backendToken) return {};
  return { Authorization: `Bearer ${session.backendToken}` };
}

function createClient(): AxiosInstance {
  return axios.create({
    baseURL: `${API_BASE}/api/v1`,
    timeout: 30_000,
  });
}

// ─── Chat ────────────────────────────────────────────────────────────────────

export async function sendMessage(
  message: string,
  sessionId?: string
): Promise<ChatResponse> {
  const headers = await getAuthHeaders();
  const client = createClient();
  const res = await client.post<ChatResponse>(
    "/chat",
    { message, session_id: sessionId },
    { headers }
  );
  return res.data;
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function fetchTasks(status?: string): Promise<Task[]> {
  const headers = await getAuthHeaders();
  const client = createClient();
  const res = await client.get<Task[]>("/tasks", {
    headers,
    params: status ? { status } : undefined,
  });
  return res.data;
}

export async function createTask(
  data: Pick<Task, "title"> & Partial<Pick<Task, "description" | "priority" | "due_date" | "project_id">>
): Promise<Task> {
  const headers = await getAuthHeaders();
  const client = createClient();
  const res = await client.post<Task>("/tasks", data, { headers });
  return res.data;
}

export async function updateTask(
  id: string,
  data: Partial<Pick<Task, "title" | "description" | "status" | "priority" | "due_date">>
): Promise<Task> {
  const headers = await getAuthHeaders();
  const client = createClient();
  const res = await client.patch<Task>(`/tasks/${id}`, data, { headers });
  return res.data;
}

export async function deleteTask(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  const client = createClient();
  await client.delete(`/tasks/${id}`, { headers });
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function fetchProjects(): Promise<Project[]> {
  const headers = await getAuthHeaders();
  const client = createClient();
  const res = await client.get<Project[]>("/projects", { headers });
  return res.data;
}

export async function createProject(data: { name: string; description?: string; color?: string }): Promise<Project> {
  const headers = await getAuthHeaders();
  const client = createClient();
  const res = await client.post<Project>("/projects", data, { headers });
  return res.data;
}

// ─── Documents ────────────────────────────────────────────────────────────────

export async function uploadDocument(file: File): Promise<Document> {
  const headers = await getAuthHeaders();
  const client = createClient();
  const form = new FormData();
  form.append("file", file);
  const res = await client.post<Document>("/documents/upload", form, {
    headers: { ...headers, "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function fetchDocuments(): Promise<Document[]> {
  const headers = await getAuthHeaders();
  const client = createClient();
  const res = await client.get<Document[]>("/documents/", { headers });
  return res.data;
}

export async function fetchDocument(id: string): Promise<Document> {
  const headers = await getAuthHeaders();
  const client = createClient();
  const res = await client.get<Document>(`/documents/${id}`, { headers });
  return res.data;
}

export async function deleteDocument(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  const client = createClient();
  await client.delete(`/documents/${id}`, { headers });
}

// ─── Knowledge Search ─────────────────────────────────────────────────────────

export async function searchKnowledge(
  query: string,
  topK: number = 5
): Promise<KnowledgeSearchResponse> {
  const headers = await getAuthHeaders();
  const client = createClient();
  const res = await client.post<KnowledgeSearchResponse>(
    "/knowledge/search",
    { query, top_k: topK },
    { headers }
  );
  return res.data;
}
