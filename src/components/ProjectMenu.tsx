import React, { useState, useEffect } from 'react';
import { Save, FolderOpen, Trash2, X, Plus, Clock, FileAudio } from 'lucide-react';
import { useStore } from '../store';
import { storageService, ProjectMetadata, ProjectData } from '../services/storageService';
import { motion, AnimatePresence } from 'motion/react';
import { db, OperationType, handleFirestoreError } from '../services/firebaseService';
import { doc, setDoc } from 'firebase/firestore';

export const ProjectMenu = ({ onClose }: { onClose: () => void }) => {
  const { 
    tracks, comments, tempo, loadProject,
    currentProjectId, currentProjectName
  } = useStore();
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [projectName, setProjectName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
    if (currentProjectName) {
      setProjectName(currentProjectName);
    }
  }, [currentProjectName]);

  const loadProjects = async () => {
    const list = await storageService.listProjects();
    setProjects(list);
  };

  const handleSave = async (isNew: boolean = false) => {
    const nameToSave = isNew ? projectName : currentProjectName;
    if (!nameToSave.trim()) return;
    
    setIsSaving(true);
    
    let id = currentProjectId;
    if (isNew) {
      // Check if a project with this name already exists for "Save As"
      const existing = projects.find(p => p.name.toLowerCase() === nameToSave.toLowerCase());
      id = existing?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2));
    }

    const projectData: ProjectData = {
      id: id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)),
      name: nameToSave,
      tempo,
      comments,
      tracks: tracks.map(({ buffer, ...rest }) => ({
        ...rest,
        clips: (rest.clips || []).map(c => ({ ...c }))
      })),
      updatedAt: Date.now()
    };

    try {
      await storageService.saveProject(projectData);
      
      // Also push metadata to Firestore for collaboration
      try {
        const firestoreData = {
          ...projectData,
          tracks: projectData.tracks.map(({ audioData, ...rest }: any) => rest)
        };
        await setDoc(doc(db, 'projects', projectData.id), firestoreData);
      } catch (err) {
        console.warn('Failed to push to cloud, project still saved locally.');
        handleFirestoreError(err, OperationType.WRITE, `projects/${projectData.id}`);
      }

      loadProject({
        currentProjectId: projectData.id,
        currentProjectName: projectData.name
      });
      await loadProjects();
    } catch (e) {
      console.error(e);
      alert('Failed to save project.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpen = async (id: string) => {
    setLoadingId(id);
    try {
      const project = await storageService.getProject(id);
      if (!project) return;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        alert("Audio recording/playback not supported in this browser.");
        return;
      }
      const audioCtx = new AudioContextClass();
      
      // Reconstitute AudioBuffers from stored audioData
      const reconstitutedTracks = await Promise.all(project.tracks.map(async (t) => {
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
      }));

      audioCtx.close();

      loadProject({
        currentProjectId: project.id,
        currentProjectName: project.name,
        tempo: project.tempo,
        comments: project.comments,
        tracks: reconstitutedTracks as any
      });
      onClose();
    } catch (e) {
      console.error(e);
      alert('Failed to open project.');
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this project?')) return;
    await storageService.deleteProject(id);
    await loadProjects();
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
          Project Manager
        </h2>
        <button onClick={onClose} className="p-1 hover:bg-[var(--color-border-inner)] rounded">
          <X size={18} />
        </button>
      </div>

      <div className="p-4 space-y-4 border-b border-[var(--color-border-main)] bg-[var(--color-bg-surface)]">
        <div className="space-y-3">
          {currentProjectId && (
            <div className="p-2 bg-[var(--color-bg-deep)] rounded border border-[var(--color-border-inner)]">
              <label className="text-[9px] text-[var(--color-text-dark)] uppercase font-bold block mb-1">Open Project</label>
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-[var(--color-accent)] truncate mr-2">{currentProjectName}</span>
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
              {currentProjectId ? 'Save as New Version' : 'Capture New Project'}
            </label>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="flex-1 bg-[var(--color-bg-deep)] border border-[var(--color-border-inner)] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[var(--color-accent)]"
                placeholder="Name..."
              />
              <button 
                onClick={() => handleSave(true)}
                disabled={isSaving || tracks.length === 0 || !projectName.trim()}
                className="bg-white/10 text-white hover:bg-white/20 p-2 rounded text-xs transition-all active:scale-95 border border-white/10"
                title="Save As"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        <h3 className="text-[10px] text-[var(--color-text-muted)] uppercase font-bold mb-3 tracking-widest">Saved Projects</h3>
        
        {projects.length === 0 ? (
          <div className="py-8 text-center text-[var(--color-text-dark)] italic text-xs">
            No saved projects yet.
          </div>
        ) : (
          projects.map((p) => (
            <div 
              key={p.id}
              onClick={() => loadingId === null && handleOpen(p.id)}
              className={`p-3 rounded-lg border group cursor-pointer transition-all ${
                loadingId === p.id 
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/5' 
                  : 'border-[var(--color-border-main)] hover:border-[var(--color-border-inner)] hover:bg-[var(--color-bg-surface)]'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white group-hover:text-[var(--color-accent)] transition-colors">{p.name}</span>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock size={10} className="text-[var(--color-text-dark)]" />
                    <span className="text-[9px] text-[var(--color-text-dark)] font-mono">
                      {new Date(p.updatedAt).toLocaleDateString()} {new Date(p.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
                <button 
                  onClick={(e) => handleDelete(p.id, e)}
                  className="p-1 text-[var(--color-text-dark)] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all hover:bg-black/20 rounded"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <FileAudio size={10} className="text-[var(--color-text-muted)]" />
                  <span className="text-[9px] text-[var(--color-text-muted)] font-bold">{p.tracksCount} Stems</span>
                </div>
                {loadingId === p.id && (
                  <span className="text-[9px] text-[var(--color-accent)] font-bold animate-pulse uppercase">Opening...</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-4 bg-[var(--color-bg-deep)] border-t border-[var(--color-border-main)]">
        <p className="text-[9px] text-[var(--color-text-dark)] leading-tight italic">
          Projects are saved locally in your browser's IndexedDB. Audio files are stored alongside project metadata.
        </p>
      </div>
    </motion.div>
  );
};
