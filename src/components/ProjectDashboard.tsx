import React, { useState, useEffect } from 'react';
import { Plus, FolderOpen, Music, Clock, ChevronRight, Trash2, ArrowLeft, Users } from 'lucide-react';
import { useStore } from '../store';
import { storageService } from '../services/storage';
import { getSharedAudioContext } from '../lib/sharedAudioContext';
import { Project } from '../services/storage/types';
import { motion, AnimatePresence } from 'motion/react';

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2, 15);

export const ProjectDashboard: React.FC = () => {
  const { loadSong, currentUser } = useStore();

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [songs, setSongs] = useState<{ id: string; name: string; updatedAt: number }[]>([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [newSongName, setNewSongName] = useState('');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [creatingSong, setCreatingSong] = useState(false);

  useEffect(() => {
    loadProjectList();
  }, []);

  useEffect(() => {
    if (selectedProject) loadSongList(selectedProject.id);
  }, [selectedProject]);

  const loadProjectList = async () => {
    const list = await storageService.listUserProjects();
    setProjects(list);
  };

  const loadSongList = async (projectId: string) => {
    const list = await storageService.listSongs(projectId);
    setSongs(list);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    setCreatingProject(true);
    try {
      const project = await storageService.createProject(newProjectName.trim());
      setNewProjectName('');
      await loadProjectList();
      setSelectedProject(project);
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingProject(false);
    }
  };

  const handleCreateSong = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSongName.trim() || !selectedProject) return;
    setCreatingSong(true);
    try {
      const songId = generateId();
      const name = newSongName.trim();
      await storageService.saveSong(selectedProject.id, songId, {
        name,
        tempo: 120,
        tracks: [],
        comments: [],
        projectId: selectedProject.id,
        updatedAt: Date.now()
      } as any);
      setNewSongName('');
      loadSong({
        currentProjectId: selectedProject.id,
        currentProjectName: selectedProject.name,
        currentSongId: songId,
        currentSongName: name,
        tracks: [],
        comments: [],
        tempo: 120
      });
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingSong(false);
    }
  };

  const handleOpenSong = async (songId: string, songName: string) => {
    if (!selectedProject) return;
    setLoadingId(songId);
    try {
      const song = await storageService.getSong(selectedProject.id, songId);
      if (!song) return;

      const audioCtx = getSharedAudioContext();
      const reconstitutedTracks = await Promise.all(
        (song.tracks || []).map(async (t: any) => {
          if (t.audioData) {
            try {
              const buffer = await audioCtx.decodeAudioData(t.audioData.slice(0));
              return { ...t, buffer };
            } catch {
              return { ...t, buffer: null };
            }
          }
          return { ...t, buffer: null };
        })
      );

      loadSong({
        currentProjectId: selectedProject.id,
        currentProjectName: selectedProject.name,
        currentSongId: songId,
        currentSongName: (song as any).name || songName,
        tempo: song.tempo,
        comments: song.comments,
        tracks: reconstitutedTracks as any
      });
    } catch (err) {
      console.error(err);
      alert('Failed to open song.');
    } finally {
      setLoadingId(null);
    }
  };

  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this project and all its songs?')) return;
    await storageService.deleteProject(id);
    if (selectedProject?.id === id) setSelectedProject(null);
    await loadProjectList();
  };

  const handleDeleteSong = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedProject) return;
    if (!confirm('Delete this song?')) return;
    await storageService.deleteSong(selectedProject.id, id);
    await loadSongList(selectedProject.id);
  };

  return (
    <div className="h-screen flex flex-col bg-[var(--color-bg-deep)] text-[#adbac7]">
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-6 border-b border-[var(--color-border-main)] bg-[var(--color-bg-sidebar)] shrink-0">
        <div className="flex items-center gap-3">
          <FolderOpen size={18} className="text-[var(--color-accent)]" />
          <span className="text-sm font-black uppercase tracking-widest text-white">JackDAW</span>
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          {currentUser?.name || 'Anonymous'}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Projects column */}
        <div className="w-72 border-r border-[var(--color-border-main)] flex flex-col bg-[var(--color-bg-sidebar)]">
          <div className="p-4 border-b border-[var(--color-border-main)]">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-3">Projects</h2>
            <form onSubmit={handleCreateProject} className="flex gap-2">
              <input
                type="text"
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                placeholder="New project name..."
                className="flex-1 bg-[var(--color-bg-deep)] border border-[var(--color-border-inner)] rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-[var(--color-accent)]"
              />
              <button
                type="submit"
                disabled={creatingProject || !newProjectName.trim()}
                className="bg-[var(--color-accent)] text-black p-1.5 rounded hover:brightness-110 disabled:opacity-40 transition-all"
              >
                <Plus size={14} />
              </button>
            </form>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {projects.length === 0 ? (
              <p className="text-[10px] text-[var(--color-text-dark)] italic text-center py-8">No projects yet.</p>
            ) : (
              projects.map(p => (
                <div
                  key={p.id}
                  onClick={() => setSelectedProject(p)}
                  className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${
                    selectedProject?.id === p.id
                      ? 'bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/30'
                      : 'hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FolderOpen size={14} className={selectedProject?.id === p.id ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'} />
                    <span className="text-xs font-bold truncate text-white">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {selectedProject?.id === p.id && <ChevronRight size={12} className="text-[var(--color-accent)]" />}
                    <button
                      onClick={e => handleDeleteProject(p.id, e)}
                      className="p-1 opacity-0 group-hover:opacity-100 text-[var(--color-text-dark)] hover:text-red-400 transition-all rounded"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Songs column */}
        <div className="flex-1 flex flex-col">
          {selectedProject ? (
            <>
              <div className="p-4 border-b border-[var(--color-border-main)]">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-sm font-black text-white">{selectedProject.name}</h2>
                    <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-widest">Songs</p>
                  </div>
                </div>
                <form onSubmit={handleCreateSong} className="flex gap-2">
                  <input
                    type="text"
                    value={newSongName}
                    onChange={e => setNewSongName(e.target.value)}
                    placeholder="New song name..."
                    className="flex-1 bg-[var(--color-bg-deep)] border border-[var(--color-border-inner)] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[var(--color-accent)]"
                  />
                  <button
                    type="submit"
                    disabled={creatingSong || !newSongName.trim()}
                    className="flex items-center gap-1.5 bg-[var(--color-accent)] text-black px-3 py-1.5 rounded text-[10px] font-black uppercase hover:brightness-110 disabled:opacity-40 transition-all"
                  >
                    <Plus size={12} /> New Song
                  </button>
                </form>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {songs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
                    <Music size={40} className="mb-4" />
                    <p className="text-xs font-black uppercase tracking-widest">No songs yet.<br />Create one above.</p>
                  </div>
                ) : (
                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {songs.map(s => (
                      <motion.div
                        key={s.id}
                        whileHover={{ scale: 1.01 }}
                        onClick={() => loadingId === null && handleOpenSong(s.id, s.name)}
                        className="group p-4 bg-[var(--color-bg-sidebar)] border border-[var(--color-border-main)] hover:border-[var(--color-accent)]/40 rounded-xl cursor-pointer transition-all"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <Music size={18} className="text-[var(--color-accent)] mt-0.5" />
                          <button
                            onClick={e => handleDeleteSong(s.id, e)}
                            className="p-1 opacity-0 group-hover:opacity-100 text-[var(--color-text-dark)] hover:text-red-400 transition-all rounded"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <p className="text-sm font-bold text-white mb-1 truncate">{s.name}</p>
                        <div className="flex items-center gap-1 text-[9px] text-[var(--color-text-dark)]">
                          <Clock size={9} />
                          <span>{new Date(s.updatedAt).toLocaleDateString()}</span>
                        </div>
                        {loadingId === s.id && (
                          <p className="text-[9px] text-[var(--color-accent)] font-bold uppercase mt-2 animate-pulse">Opening...</p>
                        )}
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-center opacity-20">
              <div>
                <FolderOpen size={48} className="mx-auto mb-4" />
                <p className="text-xs font-black uppercase tracking-widest">Select a project to see its songs</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
