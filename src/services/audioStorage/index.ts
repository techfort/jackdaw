import { createClient } from '@supabase/supabase-js';
import { openDB } from 'idb';

export interface IAudioStorage {
  upload(key: string, data: ArrayBuffer, mimeType: string): Promise<string>;
  delete(key: string): Promise<void>;
  /** Batch delete. Backends that support it (Supabase) issue a single request. */
  deleteMany(keys: string[]): Promise<void>;
}

export class NoopAudioStorage implements IAudioStorage {
  async upload(_key: string, _data: ArrayBuffer, _mimeType: string): Promise<string> {
    return '';
  }
  async delete(_key: string): Promise<void> {}
  async deleteMany(_keys: string[]): Promise<void> {}
}

export class LocalAudioStorage implements IAudioStorage {
  private db = openDB('jackdaw-local-db', 3);

  async upload(key: string, data: ArrayBuffer, mimeType: string): Promise<string> {
    const bytes = new Uint8Array(data);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const dataUrl = `data:${mimeType};base64,${btoa(binary)}`;
    const db = await this.db;
    await db.put('audio-cache', { trackId: key, dataUrl });
    return dataUrl;
  }

  async delete(key: string): Promise<void> {
    const db = await this.db;
    await db.delete('audio-cache', key);
  }

  async deleteMany(keys: string[]): Promise<void> {
    const db = await this.db;
    await Promise.all(keys.map(k => db.delete('audio-cache', k)));
  }
}

export class SupabaseAudioStorage implements IAudioStorage {
  private storage;
  private bucket: string;

  constructor(supabaseUrl: string, publishableKey: string, bucket = 'jackdaw-preview') {
    // The 'jackdaw-preview' bucket is a public preview store. Requests use the
    // anon role (the publishable key). Bucket access is granted to the `public`
    // role via the storage RLS policy in supabase-storage-policy.sql — that
    // policy is what must exist for uploads to succeed (otherwise: 403
    // "new row violates row-level security policy"). We deliberately do NOT
    // signInAnonymously() here: anonymous sign-in flips the role to
    // `authenticated`, which would then require a different policy and break if
    // the anon-auth provider is disabled.
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
      .upload(key, data, { contentType: mimeType, upsert: true });
    if (error && !/already exists/i.test(error.message)) {
      console.error(
        `Supabase upload failed for "${this.bucket}/${key}". If this is a 403 ` +
        `"row-level security policy" error, apply supabase-storage-policy.sql. ` +
        `Details:`,
        JSON.stringify(error)
      );
      throw new Error(`Supabase upload failed: ${error.message}`);
    }
    const { data: urlData } = this.storage.from(this.bucket).getPublicUrl(key);
    return urlData.publicUrl;
  }

  async delete(key: string): Promise<void> {
    await this.storage.from(this.bucket).remove([key]);
  }

  async deleteMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    // Supabase removes a whole batch in a single request.
    const { error } = await this.storage.from(this.bucket).remove(keys);
    if (error) throw new Error(`Supabase delete failed: ${error.message}`);
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

  async deleteMany(keys: string[]): Promise<void> {
    await Promise.all(keys.map(k => this.delete(k)));
  }
}

let audioStorageSingleton: IAudioStorage | null = null;

export function createAudioStorage(getIdToken: () => Promise<string>): IAudioStorage {
  if (audioStorageSingleton) return audioStorageSingleton;

  const storageMode = (import.meta.env.VITE_STORAGE_MODE as string | undefined) || 'local';
  if (storageMode === 'local') {
    audioStorageSingleton = new LocalAudioStorage();
    return audioStorageSingleton;
  }

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
