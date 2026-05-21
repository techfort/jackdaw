import { createClient } from '@supabase/supabase-js';

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
  private storage;
  private bucket: string;

  constructor(supabaseUrl: string, publishableKey: string, bucket = 'jackdaw-preview') {
    // We only need Storage API access here. Disabling auth session persistence
    // avoids multiple GoTrueClient instances and keeps requests on anon role.
    this.storage = createClient(supabaseUrl, publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }).storage;
    this.bucket = bucket;
  }

  async upload(key: string, data: ArrayBuffer, mimeType: string): Promise<string> {
    const { error } = await this.storage
      .from(this.bucket)
      .upload(key, data, { contentType: mimeType, upsert: false });
    if (error && !/already exists/i.test(error.message)) {
      throw new Error(`Supabase upload failed: ${error.message}`);
    }
    const { data: urlData } = this.storage.from(this.bucket).getPublicUrl(key);
    return urlData.publicUrl;
  }

  async delete(key: string): Promise<void> {
    await this.storage.from(this.bucket).remove([key]);
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

let audioStorageSingleton: IAudioStorage | null = null;

export function createAudioStorage(getIdToken: () => Promise<string>): IAudioStorage {
  if (audioStorageSingleton) return audioStorageSingleton;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supabaseKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;
  if (supabaseUrl && supabaseKey) {
    audioStorageSingleton = new SupabaseAudioStorage(supabaseUrl, supabaseKey);
    return audioStorageSingleton;
  }

  const workerUrl = import.meta.env.VITE_R2_WORKER_URL as string | undefined;
  if (workerUrl) {
    audioStorageSingleton = new R2AudioStorage(workerUrl, getIdToken);
    return audioStorageSingleton;
  }

  audioStorageSingleton = new NoopAudioStorage();
  return audioStorageSingleton;
}
