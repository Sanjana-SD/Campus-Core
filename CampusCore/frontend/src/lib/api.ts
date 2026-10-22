const API_BASE = '/api/v1';

export type QueryValue = string | number | boolean | null | undefined;

/** Builds "?a=1&b=2", skipping empty values. */
export function qs(params: Record<string, QueryValue>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    sp.append(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export class ApiClient {
  private static getToken(): string | null {
    return localStorage.getItem('campus_core_token');
  }

  public static setToken(token: string): void {
    localStorage.setItem('campus_core_token', token);
  }

  public static clearToken(): void {
    localStorage.removeItem('campus_core_token');
    localStorage.removeItem('campus_core_user');
  }

  private static async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      this.clearToken();
      if (!window.location.pathname.includes('/login') && window.location.pathname !== '/') {
        window.location.href = '/login?expired=true';
      }
      throw new ApiError('Session expired. Please log in again.', 401);
    }

    if (!response.ok) {
      let errorMsg = 'An error occurred';
      try {
        const errData = await response.json();
        const detail = errData.detail ?? errData.message;
        if (Array.isArray(detail)) {
          // FastAPI validation errors
          errorMsg = detail
            .map((d: { loc?: string[]; msg?: string }) => `${(d.loc || []).slice(1).join('.')}: ${d.msg}`)
            .join('; ');
        } else {
          errorMsg = typeof detail === 'string' ? detail : JSON.stringify(errData);
        }
      } catch {
        errorMsg = response.statusText;
      }
      throw new ApiError(errorMsg, response.status);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : ({} as T);
  }

  public static get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  public static post<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
  }

  public static put<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
  }

  public static patch<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
  }

  public static delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  /** Downloads an authenticated file (e.g. CSV export) and saves it in the browser. */
  public static async download(endpoint: string, filename: string): Promise<void> {
    const token = this.getToken();
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      let msg = `Export failed (HTTP ${response.status})`;
      try {
        const d = await response.json();
        if (d.detail) msg = d.detail;
      } catch {
        /* not JSON */
      }
      throw new ApiError(msg, response.status);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  public static async uploadFile<T>(endpoint: string, file: File): Promise<T> {
    const token = this.getToken();
    const formData = new FormData();
    formData.append('file', file);

    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json();
      throw new ApiError(err.detail || 'File upload failed', response.status);
    }
    return response.json();
  }
}
