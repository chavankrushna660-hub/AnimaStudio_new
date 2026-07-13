import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  Square, 
  Repeat, 
  Plus, 
  Trash2, 
  Copy, 
  FileText, 
  Settings, 
  Eye, 
  EyeOff,
  GitPullRequest,
  Maximize,
  Sparkles
} from 'lucide-react';

interface TimelineProps {
  frames: any[];
  currentFrameIndex: number;
  setCurrentFrameIndex: React.Dispatch<React.SetStateAction<number>>;
  addFrame: () => void;
  deleteFrame: (idx: number) => void;
  duplicateFrame: (idx: number) => void;
  copyFrame: (idx: number) => void;
  pasteFrame: (idx: number) => void;
  onionSkinEnabled: boolean;
  setOnionSkinEnabled: (enabled: boolean) => void;
  showBones: boolean;
  setShowBones: (enabled: boolean) => void;
  batchAddFrames: (count: number) => void;
  fps: number;
  setFps: (fps: number) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  autoTween: boolean;
  setAutoTween: (enabled: boolean) => void;
  showCanvasSizePanel?: boolean;
  setShowCanvasSizePanel?: (show: boolean) => void;
  style?: React.CSSProperties;
}

export default function Timeline({
  frames,
  currentFrameIndex,
  setCurrentFrameIndex,
  addFrame,
  deleteFrame,
  duplicateFrame,
  copyFrame,
  pasteFrame,
  onionSkinEnabled,
  setOnionSkinEnabled,
  showBones,
  setShowBones,
  batchAddFrames,
  fps,
  setFps,
  isPlaying,
  setIsPlaying,
  autoTween = true,
  setAutoTween,
  showCanvasSizePanel = false,
  setShowCanvasSizePanel,
  style,
}: TimelineProps) {
  const [loopEnabled, setLoopEnabled] = useState(true);
  const [copiedFrameIndex, setCopiedFrameIndex] = useState<number | null>(null);
  const [onionConfigOpen, setOnionConfigOpen] = useState(false);
  const [onionPrev, setOnionPrev] = useState(1);
  const [onionNext, setOnionNext] = useState(0);
  const [batchCount, setBatchCount] = useState<number>(20);

  const playbackTimerRef = useRef<any>(null);

  // Playback timer handling
  useEffect(() => {
    if (isPlaying) {
      const intervalMs = 1000 / fps;
      playbackTimerRef.current = setInterval(() => {
        setCurrentFrameIndex((prevIndex) => {
          if (prevIndex >= frames.length - 1) {
            if (loopEnabled) {
              return 0; // Loop back
            } else {
              setIsPlaying(false);
              return prevIndex;
            }
          }
          return prevIndex + 1;
        });
      }, intervalMs);
    } else {
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
      }
    }

    return () => {
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
      }
    };
  }, [isPlaying, fps, frames.length, loopEnabled]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleStop = () => {
    setIsPlaying(false);
    setCurrentFrameIndex(0);
  };

  const handleCopy = (idx: number) => {
    copyFrame(idx);
    setCopiedFrameIndex(idx);
  };

  const handlePaste = (idx: number) => {
    pasteFrame(idx);
  };

  return (
    <div style={style} className="bg-neutral-950 border-t border-neutral-800 p-4 shrink-0 flex flex-col gap-3 font-semibold select-none overflow-y-auto">
      {/* Playback Controls & Frame Rate Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left: Playback Buttons */}
        <div className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800/80 p-1.5 rounded-xl">
          <button
            onClick={handlePlayPause}
            className={`p-2 rounded-lg transition-all ${
              isPlaying 
                ? 'bg-amber-500 text-neutral-950 hover:bg-amber-400' 
                : 'hover:bg-neutral-800 text-neutral-300 hover:text-white'
            }`}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
          </button>
          <button
            onClick={handleStop}
            className="p-2 rounded-lg hover:bg-neutral-800 text-neutral-300 hover:text-white transition-colors"
            title="Stop & Reset to First Frame"
          >
            <Square className="w-4 h-4 fill-current" />
          </button>
          <div className="w-[1px] h-6 bg-neutral-800 mx-1"></div>
          <button
            onClick={() => setLoopEnabled(!loopEnabled)}
            className={`p-2 rounded-lg transition-colors ${
              loopEnabled 
                ? 'text-amber-400 bg-amber-500/10' 
                : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300'
            }`}
            title="Toggle Loop"
          >
            <Repeat className="w-4 h-4" />
          </button>
        </div>

        {/* Frame Actions (Copy, Paste, Duplicate, Delete) */}
        <div className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800/80 p-1.5 rounded-xl">
          <span className="text-[10px] text-neutral-500 font-black tracking-wider uppercase px-1.5">#{currentFrameIndex + 1}</span>
          <div className="w-[1px] h-4 bg-neutral-800 mx-1"></div>
          <button
            type="button"
            onClick={() => handleCopy(currentFrameIndex)}
            className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-all text-xs flex items-center gap-1 cursor-pointer"
            title="Copy current frame nodes"
          >
            <Copy className="w-3.5 h-3.5" />
            <span className="text-[9px] sm:text-[11px] font-bold inline">Copy</span>
          </button>
          <button
            type="button"
            onClick={() => handlePaste(currentFrameIndex)}
            disabled={copiedFrameIndex === null}
            className={`p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-all text-xs flex items-center gap-1 cursor-pointer ${
              copiedFrameIndex === null ? 'opacity-30 cursor-not-allowed' : ''
            }`}
            title="Paste copied nodes into current frame"
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="text-[9px] sm:text-[11px] font-bold inline">Paste</span>
          </button>
          <button
            type="button"
            onClick={() => duplicateFrame(currentFrameIndex)}
            className="p-1.5 rounded-lg hover:bg-neutral-800 text-amber-400 hover:text-amber-300 transition-all text-xs flex items-center gap-1 cursor-pointer"
            title="Duplicate current frame"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="text-[9px] sm:text-[11px] font-bold inline">Duplicate</span>
          </button>
          {frames.length > 1 && (
            <button
              type="button"
              onClick={() => deleteFrame(currentFrameIndex)}
              className="p-1.5 rounded-lg hover:bg-neutral-800 text-rose-500 hover:text-rose-400 transition-all text-xs flex items-center gap-1 cursor-pointer"
              title="Delete current frame"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="text-[9px] sm:text-[11px] font-bold inline">Delete</span>
            </button>
          )}
        </div>

        {/* Center: Onion Skinning & Advanced Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-800/80 p-1 rounded-xl">
            <button
              onClick={() => setOnionSkinEnabled(!onionSkinEnabled)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-black transition-colors ${
                onionSkinEnabled 
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                  : 'text-neutral-500 hover:bg-neutral-800/60'
              }`}
            >
              {onionSkinEnabled ? <Eye className="w-3.5 h-3.5 shrink-0" /> : <EyeOff className="w-3.5 h-3.5 shrink-0" />}
              <span className="text-[9px] sm:text-xs">ONION SKIN</span>
            </button>
            <button
              onClick={() => setOnionConfigOpen(!onionConfigOpen)}
              className={`p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors ${
                onionConfigOpen ? 'text-amber-400 bg-neutral-800' : ''
              }`}
              title="Onion Skin Config"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-800/80 p-1 rounded-xl">
            <button
              onClick={() => setAutoTween(!autoTween)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-black transition-colors ${
                autoTween 
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                  : 'text-neutral-500 hover:bg-neutral-800/60'
              }`}
              title="Toggle real-time automatic tweening interpolation between keyframes during playback and scrubbing"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[9px] sm:text-xs">AUTO-TWEEN</span>
            </button>
          </div>

          <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-800/80 p-1 rounded-xl">
            <button
              onClick={() => setShowBones(!showBones)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-black transition-colors ${
                showBones 
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                  : 'text-neutral-500 hover:bg-neutral-800/60'
              }`}
              title="Show or hide rigged bones skeleton overlay on canvas"
            >
              <GitPullRequest className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[9px] sm:text-xs">{showBones ? 'HIDE BONES' : 'SHOW BONES'}</span>
            </button>
          </div>

          <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-800/80 p-1 rounded-xl">
            <button
              onClick={() => setShowCanvasSizePanel?.(!showCanvasSizePanel)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-black transition-colors ${
                showCanvasSizePanel 
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                  : 'text-neutral-500 hover:bg-neutral-800/60'
              }`}
              title="Set custom canvas width and height"
            >
              <Maximize className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span className="text-[9px] sm:text-xs">CANVAS SIZE</span>
            </button>
          </div>

          {/* Quick Onion Overlay */}
          {onionConfigOpen && (
            <div className="absolute bottom-32 left-1/2 -translate-x-1/2 bg-neutral-900 border border-neutral-800 p-3.5 rounded-2xl shadow-2xl z-50 flex items-center gap-5 text-xs text-neutral-300 animate-fade-in">
              <div className="flex flex-col gap-1">
                <span className="font-bold text-neutral-400">PREVIOUS FRAMES</span>
                <input
                  type="range"
                  min="0"
                  max="5"
                  value={onionPrev}
                  onChange={(e) => setOnionPrev(Number(e.target.value))}
                  className="w-24 accent-amber-500 cursor-pointer"
                />
                <span className="text-right text-[10px] text-neutral-500 font-bold">{onionPrev} frames</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-bold text-neutral-400">NEXT FRAMES</span>
                <input
                  type="range"
                  min="0"
                  max="5"
                  value={onionNext}
                  onChange={(e) => setOnionNext(Number(e.target.value))}
                  className="w-24 accent-amber-500 cursor-pointer"
                />
                <span className="text-right text-[10px] text-neutral-500 font-bold">{onionNext} frames</span>
              </div>
            </div>
          )}
        </div>

        {/* Right: FPS presets & slider */}
        <div className="flex items-center gap-2 sm:gap-3 bg-neutral-900 border border-neutral-800/80 px-2.5 py-1.5 rounded-xl text-xs text-neutral-300">
          <span className="text-neutral-500 font-black tracking-wider uppercase hidden md:inline">SPEED</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setFps(12)}
              className={`px-1.5 py-1 rounded font-bold text-[10px] sm:text-xs ${
                fps === 12 ? 'bg-amber-500/20 text-amber-300 font-extrabold border border-amber-500/30' : 'hover:bg-neutral-800'
              }`}
            >
              12
            </button>
            <button
              onClick={() => setFps(24)}
              className={`px-1.5 py-1 rounded font-bold text-[10px] sm:text-xs ${
                fps === 24 ? 'bg-amber-500/20 text-amber-300 font-extrabold border border-amber-500/30' : 'hover:bg-neutral-800'
              }`}
            >
              24
            </button>
          </div>
          <input
            type="range"
            min="6"
            max="60"
            step="1"
            value={fps}
            onChange={(e) => setFps(Number(e.target.value))}
            className="w-16 sm:w-24 accent-amber-500 cursor-pointer"
          />
          <span className="font-bold text-neutral-300 w-10 text-right text-[10px] sm:text-xs">{fps} FPS</span>
        </div>
      </div>

      {/* Frame Cells Row */}
      <div className="flex items-center gap-2 overflow-x-auto py-2 pr-12 scrollbar-thin select-none">
        {frames.map((frame, index) => {
          const isActive = index === currentFrameIndex;
          const isCopied = index === copiedFrameIndex;
          return (
            <div
              key={index}
              onClick={() => {
                setIsPlaying(false);
                setCurrentFrameIndex(index);
              }}
              className={`group min-w-16 h-16 rounded-xl border flex flex-col justify-between p-2 cursor-pointer transition-all relative shrink-0 ${
                isActive
                  ? 'bg-amber-500/10 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.1)]'
                  : 'bg-neutral-900/60 hover:bg-neutral-900 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              {/* Frame Label */}
              <div className="flex items-center justify-between">
                <span className={`text-xs ${isActive ? 'text-amber-400 font-black' : 'text-neutral-400'}`}>
                  #{index + 1}
                </span>
                {frame.objects && Object.keys(frame.objects).length > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Has keyframe transforms"></span>
                )}
              </div>

              {/* Indicator info when not hovered */}
              <span className="text-[10px] text-neutral-500 block text-right select-none font-bold">
                {frame.objects ? Object.keys(frame.objects).length : 0} nodes
              </span>
            </div>
          );
        })}

        {/* Append Frame Button */}
        <button
          onClick={addFrame}
          className="min-w-16 h-16 rounded-xl border border-dashed border-neutral-700 hover:border-neutral-500 bg-neutral-900/30 hover:bg-neutral-900/60 flex items-center justify-center text-neutral-400 hover:text-white transition-all cursor-pointer shrink-0"
          title="Add Naya Frame"
        >
          <Plus className="w-5 h-5" />
        </button>

        {/* Batch Add Frames Section */}
        <div className="flex items-center gap-1.5 bg-neutral-950 border border-neutral-800 p-2 rounded-xl shrink-0 h-16">
          <div className="flex flex-col justify-center">
            <span className="text-[8px] text-neutral-500 font-black uppercase tracking-wider mb-0.5">Batch Add</span>
            <select
              value={batchCount}
              onChange={(e) => setBatchCount(Number(e.target.value))}
              className="bg-neutral-900 border border-neutral-800 text-neutral-300 text-[10px] rounded px-1.5 py-0.5 outline-none focus:border-amber-500 font-bold"
            >
              <option value="10">10 Frames</option>
              <option value="20">20 Frames</option>
              <option value="30">30 Frames</option>
              <option value="40">40 Frames</option>
              <option value="50">50 Frames</option>
              <option value="100">100 Frames</option>
            </select>
          </div>
          <button
            onClick={() => {
              batchAddFrames(batchCount);
            }}
            className="h-8 px-3 rounded bg-amber-500 text-neutral-950 hover:bg-amber-400 font-black text-[10px] transition-all flex items-center justify-center self-end cursor-pointer"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
