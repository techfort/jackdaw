import { useCallback } from 'react';
import { useStore } from '../store';
import { getSharedAudioContext } from '../lib/sharedAudioContext';

const decodeAndAddTrack = async (file: File, offset = 0): Promise<void> => {
  const isMp3 = file.type === 'audio/mpeg' || file.name.toLowerCase().endsWith('.mp3');
  if (!isMp3) {
    alert('Free tier: MP3 only. WAV/OGG/FLAC support coming on paid plan.');
    return;
  }

  const arrayBuffer = await file.arrayBuffer();

  try {
    const audioBuffer = await getSharedAudioContext().decodeAudioData(arrayBuffer.slice(0));
    useStore.getState().addTrack(audioBuffer, file.name, arrayBuffer, offset);
  } catch (e) {
    console.error("Decoding error:", e);
    alert("Failed to decode audio file.");
  }
};

/** Non-hook entry point so callers outside React (e.g. terminal commands) can trigger an import. */
export const triggerFileImport = (offset = 0): void => {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = '.mp3,audio/mpeg';
  input.onchange = (e) => {
    const files = Array.from((e.target as HTMLInputElement).files || []);
    files.forEach(file => decodeAndAddTrack(file, offset));
  };
  input.click();
};

export const useFileImport = () => {
  const handleFile = useCallback((file: File, offset = 0) => decodeAndAddTrack(file, offset), []);
  const importFiles = useCallback((offset = 0) => triggerFileImport(offset), []);

  return { handleFile, importFiles };
};
