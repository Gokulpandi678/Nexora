'use client'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fieldErrors: Record<string, string[]> = {}
  ) {
    super(message)
  }
}

interface ErrorBody {
  error?: string
  fieldErrors?: Record<string, string[]>
}

export async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    // Identity travels in the WorkOS session cookie
    headers: { 'Content-Type': 'application/json', ...init.headers }
  })
  if (res.status === 204) return undefined as T
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const body = (data ?? {}) as ErrorBody
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`, body.fieldErrors)
  }
  return data as T
}

export const fetcher = <T>(url: string): Promise<T> => apiFetch<T>(url)

export const postJson = <T>(url: string, body: unknown, method: 'POST' | 'PATCH' = 'POST'): Promise<T> =>
  apiFetch<T>(url, { method, body: JSON.stringify(body) })
