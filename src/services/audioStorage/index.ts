import { StorageClient } from '@supabase/storage-js';

export interface IAudioStorage {
  upload(key: string, data: ArrayBuffer, mimeType: string): Promise<string>;
  delete(key: string): Promise<void>;
}

export class NoopAudioStorage implements IAudioStorage {
  async upload(_key: string, _data: ArrayBuffer, _mimeType: string): Promise<string> {
    return '';
  }
  async delete(_key: string): Promise<void> {}
}

export class SupabaseAudioStorage implements IAudioStorage {
  private client: StorageClient;
  private bucket: string;

  constructor(supabaseUrl: string, anonKey: string, bucket = 'jackdaw-preview') {
    this.client = new StorageClient(`${supabaseUrl}/storage/v1`, {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    });
    this.bucket = bucket;
  }

  async upload(key: string, data: ArrayBuffer, mimeType: string): Promise<string> {
    const { error } = await this.client
      .from(this.bucket)
      .upload(key, data, { contentType: mimeType, upsert: true });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);
    const { data: urlData } = this.client.from(this.bucket).getPublicUrl(key);
    return urlData.publicUrl;
  }

  async delete(key: string): Promise<void> {
    await this.client.from(this.bucket).remove([key]);
  }
}

export class R2AudioStorage implements IAudioStorage {
  constructor(private workerUrl: string, private getIdToken: () => Promise<string>) {}

  async upload(key: string, data: ArrayBuffer, mimeType: string): Promise<string> {
    const token = await this.getIdToken();
    const res = await fetch(`${this.workerUrl}/upload?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': mimeType },
      body: data,
    });
    if (!res.ok) throw new Error(`R2 upload failed (${res.status}): ${await res.text()}`);
    const { url } = await res.json() as { url: string };
    return url;
  }

  async delete(key: string): Promise<void> {
    const token = await this.getIdToken();
    await fetch(`${this.workerUrl}/delete?key=${encodeURIComponent(key)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}

export function createAudioStorage(getIdToken: () => Promise<string>): IAudioStorage {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (supabaseUrl && supabaseAnonKey) {
    return new SupabaseAudioStorage(supabaseUrl, supabaseAnonKey);
  }

  const workerUrl = import.meta.env.VITE_R2_WORKER_URL as string | undefined;
  if (workerUrl) {
    return new R2AudioStorage(workerUrl, getIdToken);
  }

  return new NoopAudioStorage();
}
