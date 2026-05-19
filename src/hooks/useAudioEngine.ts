import { useRef, useEffect } from 'react';
import { useStore } from '../store';

export const useAudioEngine = () => {
  const audioContext = useRef<AudioContext | null>(null);
  const trackNodes = useRef<{ [clipId: string]: AudioBufferSourceNode }>({});
  const gainNodes = useRef<{ [clipId: string]: GainNode }>({});
  
  const { 
    tracks, 
    isPlaying, 
    currentTime, 
    setIsPlaying, 
    setCurrentTime 
  } = useStore();

  useEffect(() => {
    if (!audioContext.current) {
      audioContext.current = new AudioContext();
    }
  }, []);

  const stopAll = () => {
    Object.values(trackNodes.current).forEach((node: AudioBufferSourceNode) => {
      try {
        node.stop();
      } catch (e) {}
    });
    trackNodes.current = {};
  };

  const startPlayback = (startTime: number) => {
    if (!audioContext.current) return;
    
    stopAll();
    
    if (audioContext.current.state === 'suspended') {
      audioContext.current.resume();
    }

    const now = audioContext.current.currentTime;
    
    tracks.forEach(track => {
      if (!track.buffer || track.isMuted) return;
      
      const isSoloedSomewhere = tracks.some(t => t.isSoloed);
      const shouldBeHearable = !isSoloedSomewhere || track.isSoloed;

      (track.clips || []).forEach(clip => {
        if (clip.isMuted || !shouldBeHearable) return;

        const source = audioContext.current!.createBufferSource();
        source.buffer = track.buffer;
        
        const gain = audioContext.current!.createGain();
        gain.gain.value = track.volume;
        
        source.connect(gain);
        gain.connect(audioContext.current!.destination);
        
        // Calculate offset and duration
        const clipStart = clip.offset;
        const clipEnd = clip.offset + clip.duration;
        
        if (startTime < clipEnd) {
          const offsetInClip = Math.max(0, startTime - clipStart);
          const whenToStart = now + Math.max(0, clipStart - startTime);
          const startOffsetInSource = Number(clip.audioStart || 0) + offsetInClip;
          const durationToPlay = Math.max(0, clip.duration - offsetInClip);
          
          if (isFinite(whenToStart) && isFinite(startOffsetInSource) && isFinite(durationToPlay)) {
            try {
              source.start(whenToStart, startOffsetInSource, durationToPlay);
              trackNodes.current[clip.id] = source;
              gainNodes.current[clip.id] = gain;
            } catch (e) {
              console.error("Failed to start playback source:", e, { whenToStart, startOffsetInSource, durationToPlay });
            }
          }
        }
      });
    });
  };

  useEffect(() => {
    if (isPlaying) {
      startPlayback(currentTime);
      
      const startTime = Date.now() / 1000 - currentTime;
      let animationFrame: number;
      
      const tick = () => {
        const newTime = Date.now() / 1000 - startTime;
        setCurrentTime(newTime);
        animationFrame = requestAnimationFrame(tick);
      };
      
      animationFrame = requestAnimationFrame(tick);
      
      return () => {
        cancelAnimationFrame(animationFrame);
        stopAll();
      };
    } else {
      stopAll();
    }
  }, [isPlaying]);

  // Handle Mute/Solo/Volume updates in real-time
  useEffect(() => {
    if (!audioContext.current) return;
    tracks.forEach(track => {
      (track.clips || []).forEach(clip => {
        const gain = gainNodes.current[clip.id];
        if (gain) {
          const isSoloedSomewhere = tracks.some(t => t.isSoloed);
          const shouldBeHearable = !track.isMuted && !clip.isMuted && (!isSoloedSomewhere || track.isSoloed);
          gain.gain.setTargetAtTime(shouldBeHearable ? track.volume : 0, audioContext.current!.currentTime, 0.05);
        }
      });
    });
  }, [tracks]);

  return { audioContext: audioContext.current };
};
