import { useCallback } from 'react';
import { useStore } from '../store';

export const useFileImport = () => {
  const addTrack = useStore(state => state.addTrack);

  const handleFile = useCallback(async (file: File, offset = 0) => {
    if (!file.type.startsWith('audio/') && !file.name.endsWith('.ogg')) {
      alert("Please upload an audio file (.wav, .mp3, .ogg)");
      return;
    }

    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await file.arrayBuffer();
    
    try {
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0)); // slice to clone if needed
      addTrack(audioBuffer, file.name, arrayBuffer, offset);
    } catch (e) {
      console.error("Decoding error:", e);
      alert("Failed to decode audio file.");
    } finally {
      audioCtx.close();
    }
  }, [addTrack]);

  const importFiles = useCallback((offset = 0) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'audio/*';
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      files.forEach(file => handleFile(file, offset));
    };
    input.click();
  }, [handleFile]);

  return { handleFile, importFiles };
};
