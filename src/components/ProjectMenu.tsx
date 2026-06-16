import React, { useState, useEffect } from 'react';
import { Save, FolderOpen, Trash2, X, Plus, Clock } from 'lucide-react';
import { useStore } from '../store';
import { storageService } from '../services/storage';
import { getSharedAudioContext } from '../lib/sharedAudioContext';
import { motion, AnimatePresence } from 'motion/react';

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

export const ProjectMenu = ({ onClose }: { onClose: () => void }) => {
  const {
    tracks, comments, tempo, loadSong,
    currentProjectId, currentSongId, currentSongName
  } = useStore();

  // Fallback project ID when no project has been created yet
  const projectId = currentProjectId || 'local';

  const [songs, setSongs] = useState<{ id: string; name: string; updatedAt: number }[]>([]);
  const [songName, setSongName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    loadSongList();
    if (currentSongName) setSongName(currentSongName);
  }, [currentSongName, projectId]);

  const loadSongList = async () => {
    const list = await storageService.listSongs(projectId);
    setSongs(list);
  };

  const handleSave = async (isNew: boolean = false) => {
    const nameToSave = isNew ? songName : currentSongName;
    if (!nameToSave.trim()) return;

    setIsSaving(true);

    let id = currentSongId;
    if (isNew) {
      const existing = songs.find(s => s.name.toLowerCase() === nameToSave.toLowerCase());
      id = existing?.id || generateId();
    }
    if (!id) id = generateId();

    try {
      await storageService.saveSong(projectId, id, {
        name: nameToSave,
        tempo,
        comments,
        tracks: tracks.map(({ ...rest }) => ({
          ...rest,
          clips: (rest.clips || []).map(({ buffer: _buf, ...c }) => c)
        })) as any,
        updatedAt: Date.now(),
        projectId
      } as any);

      loadSong({
        currentSongId: id,
        currentSongName: nameToSave
      });
      await loadSongList();
    } catch (e) {
      console.error(e);
      alert('Failed to save song.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpen = async (id: string) => {
    setLoadingId(id);
    try {
      const song = await storageService.getSong(projectId, id);
      if (!song) return;

      const audioCtx = getSharedAudioContext();

      const reconstitutedTracks = await Promise.all(
        (song.tracks || []).map(async (t: any) => {
          if (t.audioData) {
            try {
              const buffer = await audioCtx.decodeAudioData(t.audioData.slice(0));
              return { ...t, buffer };
            } catch (e) {
              console.error(`Failed to decode track ${t.name}:`, e);
              return { ...t, buffer: null };
            }
          }
          return { ...t, buffer: null };
        })
      );

      loadSong({
        currentSongId: id,
        currentSongName: (song as any).name || 'Untitled',
        tempo: song.tempo,
        comments: song.comments,
        tracks: reconstitutedTracks as any
      });
      onClose();
    } catch (e) {
      console.error(e);
      alert('Failed to open song.');
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this song?')) return;
    await storageService.deleteSong(projectId, id);
    await loadSongList();
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="fixed inset-y-0 right-0 w-80 bg-[var(--color-bg-sidebar)] border-l border-[var(--color-border-main)] shadow-2xl flex flex-col z-[100]"
    >
      <div className="p-4 border-b border-[var(--color-border-main)] flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
          <FolderOpen size={16} className="text-[var(--color-accent)]" />
          Songs
        </h2>
        <button onClick={onClose} className="p-1 hover:bg-[var(--color-border-inner)] rounded">
          <X size={18} />
        </button>
      </div>

      <div className="p-4 space-y-4 border-b border-[var(--color-border-main)] bg-[var(--color-bg-surface)]">
        <div className="space-y-3">
          {currentSongId && (
            <div className="p-2 bg-[var(--color-bg-deep)] rounded border border-[var(--color-border-inner)]">
              <label className="text-[9px] text-[var(--color-text-dark)] uppercase font-bold block mb-1">Current Song</label>
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-[var(--color-accent)] truncate mr-2">{currentSongName}</span>
                <button
                  onClick={() => handleSave(false)}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 bg-[var(--color-accent)] text-black px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-tight hover:brightness-110 disabled:opacity-50 transition-all active:scale-95 shadow-lg shadow-[var(--color-accent)]/20"
                >
                  <Save size={12} />
                  Save
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[10px] text-[var(--color-text-muted)] uppercase font-bold">
              {currentSongId ? 'Save as New Song' : 'Save Song'}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={songName}
                onChange={(e) => setSongName(e.target.value)}
                className="flex-1 bg-[var(--color-bg-deep)] border border-[var(--color-border-inner)] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[var(--color-accent)]"
                placeholder="Song name..."
              />
              <button
                onClick={() => handleSave(true)}
                disabled={isSaving || tracks.length === 0 || !songName.trim()}
                className="bg-white/10 text-white hover:bg-white/20 p-2 rounded text-xs transition-all active:scale-95 border border-white/10"
                title="Save As New"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        <h3 className="text-[10px] text-[var(--color-text-muted)] uppercase font-bold mb-3 tracking-widest">Saved Songs</h3>

        {songs.length === 0 ? (
          <div className="py-8 text-center text-[var(--color-text-dark)] italic text-xs">
            No saved songs yet.
          </div>
        ) : (
          songs.map((s) => (
            <div
              key={s.id}
              onClick={() => loadingId === null && handleOpen(s.id)}
              className={`p-3 rounded-lg border group cursor-pointer transition-all ${
                loadingId === s.id
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/5'
                  : 'border-[var(--color-border-main)] hover:border-[var(--color-border-inner)] hover:bg-[var(--color-bg-surface)]'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white group-hover:text-[var(--color-accent)] transition-colors">{s.name}</span>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock size={10} className="text-[var(--color-text-dark)]" />
                    <span className="text-[9px] text-[var(--color-text-dark)] font-mono">
                      {new Date(s.updatedAt).toLocaleDateString()} {new Date(s.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {loadingId === s.id && (
                    <span className="text-[9px] text-[var(--color-accent)] font-bold animate-pulse uppercase mt-1">Opening...</span>
                  )}
                </div>
                <button
                  onClick={(e) => handleDelete(s.id, e)}
                  className="p-1 text-[var(--color-text-dark)] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all hover:bg-black/20 rounded"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-4 bg-[var(--color-bg-deep)] border-t border-[var(--color-border-main)]">
        <p className="text-[9px] text-[var(--color-text-dark)] leading-tight italic">
          Songs are saved locally in your browser's IndexedDB.
        </p>
      </div>
    </motion.div>
  );
};
