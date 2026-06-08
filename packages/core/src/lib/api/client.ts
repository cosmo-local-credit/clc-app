/**
 * Platform-agnostic API client.
 *
 * This file must NOT import from react, react-dom, or any router library.
 * It can be reused as-is in React Native.
 *
 * Call configureApi(url) at app startup before any requests — in web via
 * import.meta.env, in React Native via a build-time constant.
 */

let _baseUrl = "http://localhost:3001";

export function configureApi(url: string) {
  _baseUrl = url;
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

class ApiClient {
  private authToken: string | null = null;

  setAuthToken(token: string | null) {
    this.authToken = token;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.authToken) {
      headers.Authorization = `Bearer ${this.authToken}`;
    }
    return headers;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = "GET", body, headers: extraHeaders } = options;

    const response = await fetch(`${_baseUrl}${path}`, {
      method,
      headers: { ...this.getHeaders(), ...extraHeaders },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new ApiError(response.status, await response.text());
    }

    return response.json() as Promise<T>;
  }

  get<T>(path: string) {
    return this.request<T>(path);
  }

  post<T>(path: string, body: unknown) {
    return this.request<T>(path, { method: "POST", body });
  }

  put<T>(path: string, body: unknown) {
    return this.request<T>(path, { method: "PUT", body });
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: "DELETE" });
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`API Error ${status}: ${body}`);
    this.name = "ApiError";
  }
}

export const apiClient = new ApiClient();
