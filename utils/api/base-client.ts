import { APIRequestContext } from '@playwright/test';
import { IHttpClient } from './http-client';

export class BaseApiClient implements IHttpClient {
  constructor(private readonly api: APIRequestContext) {}

  async get<T>(path: string): Promise<T> {
    const res = await this.api.get(path);
    if (!res.ok()) throw new Error(`GET ${path} → ${res.status()}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await this.api.post(path, {
      data: body,
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok()) throw new Error(`POST ${path} → ${res.status()}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  async delete(path: string): Promise<void> {
    const res = await this.api.delete(path);
    if (!res.ok() && res.status() !== 404)
      throw new Error(`DELETE ${path} → ${res.status()}: ${await res.text()}`);
  }

  async getStatus(path: string): Promise<number> {
    const res = await this.api.get(path);
    return res.status();
  }
}