---
name: jackdaw
description: Load full JackDAW project context for development work — architecture, conventions, domain patterns, current phase status, and critical rules. Invoke before starting any feature work, debugging, or code review on this project.
---

# JackDAW Development Context

JackDAW is a collaborative, browser-based DAW (Digital Audio Workstation). It lets musicians record, arrange, and mix multi-track audio sessions and collaborate in real time with other musicians via a project/song hierarchy.

## Stack

| Layer | Technology |
|-------|-----------|
| UI | React 19, TypeScript 5.8, Tailwind CSS 4, Lucide icons, Motion (Framer) |
| State | Zustand 5 — single `useStore` in `src/store.ts` |
| Audio | Web Audio API — `AudioContext`, `AudioBufferSourceNode`, `GainNode` |
| Storage (local) | IndexedDB via `idb` 8 — `LocalStorageService` |
| Storage (cloud) | Firebase Firestore 12 — `FirebaseStorageService` |
| Auth | Firebase magic-link email or anonymous local auth |
| Build | Vite 6, deployed via Firebase Hosting |
| Issue tracker | Beads (`bd`) — always use `bd` for task tracking, never TodoWrite |

## Data Hierarchy

```
User
 └── Project  (e.g. "Doomsword Album")  → projects/{projectId}
       ├── Members  { userId, role: owner|editor|viewer }
       ├── Invites  { email, role, expiresAt, status }
       └── Songs    (individual DAW sessions)  → projects/{projectId}/songs/{songId}
             └── Tracks (audio stems)
```

**Terminology rules — strictly enforced:**
- **Project** = top-level container (band/album). Never call this a "song".
- **Song** = single DAW session with tracks, tempo, comments. Was previously called "project" in old code — always rename on sight.
- **Track** = individual audio stem within a song. Never called "project".
- **Clip** = a region of a track on the timeline (offset, duration, audioStart).

## Key Files

```
src/
  types.ts                     — DAWState, TrackData, Clip, Comment interfaces
  store.ts                     — Zustand store: all state + actions
  App.tsx                      — Root: layout, keyboard shortcuts, auth init, sync subscription
  components/
    Toolbar.tsx                — Playback controls, tempo, zoom, tool selector, save/import
    TrackItem.tsx              — Track row: waveform canvas, mute/solo, clips, comments
    WaveformRenderer.tsx       — Canvas waveform; only renders visible viewport region
    TimelineRuler.tsx          — Click-to-seek ruler, beat/time markers
    Mixer.tsx                  — Channel strip mixer panel
    CollaborationPanel.tsx     — Comments, presence, auth UI
    CollaborativeCursors.tsx   — Animated remote user cursors
    ProjectMenu.tsx            — Save/load songs (uses storageService.saveSong/listSongs)
    Dropzone.tsx               — Drag-and-drop audio file import
  hooks/
    useAudioEngine.ts          — Web Audio playback engine (startPlayback, stopAll)
    useFileImport.ts           — Decode audio files → addTrack
    usePresenceSync.ts         — Throttled presence updates
  lib/
    sharedAudioContext.ts      — Singleton AudioContext (MUST be used for both decode and playback)
    exportUtils.ts             — WAV mixdown via OfflineAudioContext
  services/
    firebaseService.ts         — Firebase init, OperationType enum, handleFirestoreError
    storage/
      index.ts                 — Selects backend via VITE_STORAGE_MODE ('local'|'firebase')
      types.ts                 — StorageService + AuthService interfaces
      LocalStorage.ts          — IDB v2: 'songs' store + 'projects' store (separated in v2 migration)
      LocalAuth.ts             — Local anonymous auth
      FirebaseStorage.ts       — Full Firestore implementation
      FirebaseAuth.ts          — Magic-link + anonymous Firebase auth
firebase-applet-config.json    — Firebase project config (projectId: jackdaw-e862a)
firestore.rules                — Member-based security rules (isMember/canEdit/isOwner)
.env.local                     — VITE_STORAGE_MODE=local (default)
```

## Storage Layer Rules

- **Always import from `../services/storage`** (the index), never from `storageService.ts` (deleted).
- Song ops: `saveSong(projectId, songId, data)`, `listSongs(projectId)`, `getSong(projectId, songId)`, `deleteSong(projectId, songId)`
- Project ops: `createProject(name)`, `listUserProjects()`, `getProject(id)`
- When no project context exists yet, use `currentProjectId || 'local'` as the fallback projectId.
- IDB songs are keyed as `projectId/songId` (composite). `listSongs` filters by `projectId` field.
- Audio `ArrayBuffer` and `AudioBuffer` are **never** persisted to Firestore — strip them before `saveSong`.

## Audio Engine Rules

- `getSharedAudioContext()` from `src/lib/sharedAudioContext.ts` MUST be used everywhere. Never create a standalone `new AudioContext()`.
- Always `await ctx.resume()` before scheduling sources (browser autoplay policy).
- `source.start(when, offset, duration)` — validate all three values are finite and `duration > 0` before calling.
- Clip timeline: `offset` = timeline position (seconds), `audioStart` = position within the source buffer, `duration` = playback length.
- Track mute/solo: check `tracks.some(t => t.isSoloed)` first; if any track is soloed, only soloed tracks are audible.

## Zustand Store Patterns

- `pushToHistory()` before any state mutation that should be undoable.
- Use `silent = true` on `updateTrack`/`updateClip` during drag operations — avoids history spam and skips `pushUpdate`.
- After any mutation that should persist: `get().pushUpdate()`.
- `currentSongId` / `currentSongName` = the active song session.
- `currentProjectId` / `currentProjectName` = the top-level project container.
- `loadSong` is primary; `loadProject` is an alias kept for backward compat.
- `syncSong(projectId, songId)` returns an unsubscribe function — call it on cleanup.

## Collaboration & Auth

- Storage mode controlled by `VITE_STORAGE_MODE` env var.
- Firebase mode uses magic-link email sign-in; local mode uses anonymous localStorage identity.
- Firestore rules use `isMember(projectId)` helper — all subcollection access requires membership.
- Invite flow: owner calls `inviteToProject` → Firebase sends magic-link email with `?invite=ID&project=ID` in callback URL → invitee lands on app → `InviteAccept` modal calls `acceptInvite` → writes member doc + `userProjects` mirror.
- Presence updates are throttled (1s) via `usePresenceSync`.

## CSS / Theming

- All colors via CSS variables: `--color-bg-deep`, `--color-bg-sidebar`, `--color-bg-surface`, `--color-accent`, `--color-border-main`, `--color-border-inner`, `--color-text-muted`, `--color-text-dark`.
- Component class pattern: Tailwind utilities + CSS variable references like `bg-[var(--color-accent)]`.
- Animations use Motion (`motion/react`) — use `AnimatePresence` for mount/unmount transitions.
- No emojis in UI unless explicitly requested.

## Implementation Phases (Status)

| Phase | Description | Status |
|-------|-------------|--------|
| A | Unify storage service layer | ✅ Done |
| B | Type renames — ProjectData→SongData, new types | ✅ Done |
| C | Firebase + LocalStorage full implementation | ✅ Done |
| D | Wire store & App to two-level hierarchy | 🔲 Next (`jackdaw-la7`) |
| E | UI — ProjectDashboard, SongMenu, MembersPanel, InviteAccept | 🔲 Blocked on D (`jackdaw-ei1`) |
| F | Auth upgrade — sign-in gate, user profiles | 🔲 Blocked on D (`jackdaw-35a`) |

## Beads Workflow

```bash
bd ready                        # see what's unblocked
bd show <id>                    # read issue detail before starting
bd update <id> --claim          # claim before coding
bd close <id>                   # mark done
bd remember "insight"           # persist knowledge across sessions
```

Never use TodoWrite or TaskCreate — always `bd`.

## Common Pitfalls (learned in this project)

- **Never pass a React event as `offset`** — `onClick={fn}` passes the MouseEvent; always use `onClick={() => fn()}`.
- **Never create a throwaway `AudioContext`** for decoding and a separate one for playback — they must be the same singleton or decoding produces buffers incompatible with playback.
- **`updateDoc` fails on non-existent Firestore docs** — use `setDoc(..., { merge: true })` for upserts.
- **IDB version bump required careful migration** — v1 had songs+projects in one 'projects' store; v2 separates into 'songs' and 'projects'. The upgrade handler iterates records keyed with '/' and moves them.
- **`request.time.toMillis()` exact match fails** in Firestore rules when using `Date.now()` — use a ±30s tolerance check instead.
- **Firebase top-level `await` in `index.ts`** — Vite supports this natively for ES modules; dynamic `import()` keeps Firebase out of the bundle in local mode.
