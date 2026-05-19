import React from 'react';
import { Upload } from 'lucide-react';
import { useFileImport } from '../hooks/useFileImport';

export const Dropzone: React.FC = () => {
  const { handleFile, importFiles } = useFileImport();

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    files.forEach(handleFile);
  };

  return (
    <div 
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-[var(--color-border-main)] rounded-xl m-4 bg-[var(--color-bg-sidebar)] hover:bg-[var(--color-bg-surface)] transition-colors group cursor-pointer"
      onClick={importFiles}
    >
      <div className="flex flex-col items-center gap-3 text-[var(--color-text-muted)] group-hover:text-white transition-colors">
        <div className="p-4 rounded-full bg-[var(--color-bg-deep)] group-hover:bg-[var(--color-bg-input)] transition-colors">
          <Upload size={32} className="group-hover:text-[var(--color-accent)] transition-colors" />
        </div>
        <div className="text-center">
          <p className="font-medium">Drop audio stems here</p>
          <p className="text-xs">Supports WAV, MP3, OGG</p>
        </div>
      </div>
    </div>
  );
};
