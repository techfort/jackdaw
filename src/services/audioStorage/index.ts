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

export class R2AudioStorage implements IAudioStorage {
  constructor(private workerUrl: string, private getIdToken: () => Promise<string>) {}

  async upload(key: string, data: ArrayBuffer, mimeType: string): Promise<string> {
    const token = await this.getIdToken();
    const res = await fetch(`${this.workerUrl}/upload?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': mimeType,
      },
      body: data,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`R2 upload failed (${res.status}): ${text}`);
    }
    const { url } = await res.json<{ url: string }>();
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
  const workerUrl = import.meta.env.VITE_R2_WORKER_URL as string | undefined;
  if (workerUrl) {
    return new R2AudioStorage(workerUrl, getIdToken);
  }
  return new NoopAudioStorage();
}
