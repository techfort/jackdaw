// @ts-ignore lamejs has no bundled type declarations
import Lame from 'lamejs';

function floatToInt16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

export function audioBufferToMp3(audioBuffer: AudioBuffer, bitrate = 128): ArrayBuffer {
  const channels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const encoder = new Lame.Mp3Encoder(channels, sampleRate, bitrate);

  const blockSize = 1152;
  const left = floatToInt16(audioBuffer.getChannelData(0));
  const right = channels > 1 ? floatToInt16(audioBuffer.getChannelData(1)) : left;

  const chunks: Int8Array[] = [];
  for (let i = 0; i < left.length; i += blockSize) {
    const mp3buf = encoder.encodeBuffer(
      left.subarray(i, i + blockSize),
      right.subarray(i, i + blockSize)
    );
    if (mp3buf.length > 0) chunks.push(mp3buf);
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(tail);

  const totalBytes = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out.buffer;
}
