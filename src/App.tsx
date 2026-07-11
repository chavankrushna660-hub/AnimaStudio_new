import React, { useState, useEffect, useRef } from 'react';
import { 
  Undo2, 
  Redo2, 
  Play, 
  Pause, 
  Video, 
  Upload, 
  Download, 
  Plus, 
  Settings, 
  Sparkles,
  ExternalLink,
  GitPullRequest,
  Trash2,
  User,
  UserCheck,
  LogOut,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Lock,
  Mail,
  Sun,
  Moon,
  HelpCircle,
  Megaphone,
  Tv,
  Info,
  AlertCircle,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Toolbar from './components/Toolbar';
import LeftPanel from './components/LeftPanel';
import RightPanel from './components/RightPanel';
import CanvasArea from './components/CanvasArea';
import Timeline from './components/Timeline';
import { VectorObject, Bone, Layer, Frame, Point, RealismSettings, View360, BrushSettings } from './types';
import { localToWorld, rotatePoint, calculateBoundingBox } from './utils/math';
import { 
  validateSimpleAuth, 
  saveUserAnimation, 
  getUserAnimation, 
  deleteUserAnimation, 
  SavedAnimationRecord 
} from './utils/database';
import { 
  generate3DGeometry, 
  getDailyLimitStatus, 
  incrementDailyLimit,
  extrude2DTo3D
} from './utils/engine3D';

interface AdItem {
  id: number;
  title: string;
  tagline: string;
  badge: string;
  actionText: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  adKey?: string;
  format?: 'iframe' | 'script';
  height?: number;
  width?: number;
  scriptUrl?: string;
  containerId?: string;
}

const ADS_DATA: AdItem[] = [
  {
    id: 1,
    title: "Adsterra Display Banner",
    tagline: "Premium High CPM Ad Unit #30203380",
    badge: "Premium Banner",
    actionText: "Visit Ads",
    bgColor: "from-indigo-950/40 to-blue-950/20",
    borderColor: "border-indigo-500/35",
    textColor: "text-indigo-400",
    adKey: "3b74f090f064befb058515e368086175",
    format: "iframe",
    height: 60,
    width: 468
  },
  {
    id: 2,
    title: "Adsterra Native Recommendation",
    tagline: "Dynamic Grid Ad Unit #30203378",
    badge: "Native Ad",
    actionText: "Learn More",
    bgColor: "from-emerald-950/40 to-teal-950/20",
    borderColor: "border-emerald-500/35",
    textColor: "text-emerald-400",
    scriptUrl: "https://pl30303877.effectivecpmnetwork.com/935bef08c988c2000100df96459b2487/invoke.js",
    containerId: "container-935bef08c988c2000100df96459b2487",
    format: "script"
  },
  {
    id: 3,
    title: "Adsterra Vertical Skyscraper",
    tagline: "Premium Vertical Banner 160x300",
    badge: "Skyscraper",
    actionText: "Explore",
    bgColor: "from-amber-950/40 to-orange-950/20",
    borderColor: "border-amber-500/35",
    textColor: "text-amber-400",
    adKey: "6407bfebf17c2bd4797b6b2fc6c370b2",
    format: "iframe",
    height: 300,
    width: 160
  },
  {
    id: 4,
    title: "Adsterra Social Bar Overlay",
    tagline: "Active Dynamic Notification Unit",
    badge: "Social Bar",
    actionText: "View",
    bgColor: "from-rose-950/40 to-pink-950/20",
    borderColor: "border-rose-500/35",
    textColor: "text-rose-400",
    scriptUrl: "https://pl30303877.effectivecpmnetwork.com/df/17/95/df1795f51867881fe197297866204a48.js",
    format: "script"
  },
  {
    id: 5,
    title: "Adsterra Popunder Engine",
    tagline: "Optimized High Revenue Unit",
    badge: "Popunder",
    actionText: "Details",
    bgColor: "from-purple-950/40 to-fuchsia-950/20",
    borderColor: "border-purple-500/35",
    textColor: "text-purple-400",
    scriptUrl: "https://pl30303877.effectivecpmnetwork.com/df/f0/84/dff084256f85526d6cfc6857a375d4021.js",
    format: "script"
  }
];

function AdsterraIframe({ adKey, format, height, width, scriptUrl, containerId, align = 'bottom' }: { adKey?: string; format?: string; height?: number; width?: number; scriptUrl?: string; containerId?: string; key?: string | number; align?: 'top' | 'bottom' }) {
  let srcDoc = "";

  const alignment = align === 'bottom' ? 'flex-end' : 'flex-start';

  if (format === 'iframe' && adKey) {
    srcDoc = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body, html { margin: 0; padding: 0; overflow: hidden; display: flex; justify-content: center; align-items: ${alignment}; background: transparent; height: 100%; width: 100%; }
        </style>
      </head>
      <body>
        <script type="text/javascript">
          atOptions = {
            'key' : '${adKey}',
            'format' : 'iframe',
            'height' : ${height || 60},
            'width' : ${width || 468},
            'params' : {}
          };
        </script>
        <script type="text/javascript" src="https://pl30303877.effectivecpmnetwork.com/${adKey}/invoke.js"></script>
      </body>
      </html>
    `;
  } else if (scriptUrl) {
    srcDoc = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body, html { margin: 0; padding: 0; overflow: hidden; display: flex; justify-content: center; align-items: ${alignment}; background: transparent; height: 100%; width: 100%; }
        </style>
      </head>
      <body>
        ${containerId ? `<div id="${containerId}" style="width: 100%; height: 100%; display: flex; justify-content: center; align-items: ${alignment};"></div>` : ''}
        <script async="async" data-cfasync="false" src="${scriptUrl}"></script>
      </body>
      </html>
    `;
  }

  if (!srcDoc) return null;

  return (
    <iframe
      srcDoc={srcDoc}
      title={`Adsterra Ad ${adKey || 'Script'}`}
      width="100%"
      height="100%"
      className="border-0 bg-transparent overflow-hidden w-full h-full"
      style={{ border: 'none', outline: 'none' }}
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
    />
  );
}

export default function App() {
  // Ads Index State (4 separate, continuous ads changing every 1 minute)
  const [adTick, setAdTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setAdTick(prev => prev + 1);
    }, 60000); // Changes every 1 minute!
    return () => clearInterval(interval);
  }, []);

  const topAdIndex1 = adTick % ADS_DATA.length;
  const topAdIndex2 = (adTick + 1) % ADS_DATA.length;
  const bottomAdIndex1 = (adTick + 2) % ADS_DATA.length;
  const bottomAdIndex2 = (adTick + 3) % ADS_DATA.length;

  // Toast notifications state
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'warning' | 'info' }[]>([]);

  const classifyToast = (msg: string): 'success' | 'error' | 'warning' | 'info' => {
    const lowercase = msg.toLowerCase();
    if (
      lowercase.includes('success') || 
      lowercase.includes('successfully') || 
      lowercase.includes('loaded') || 
      lowercase.includes('grouped') || 
      lowercase.includes('attached') || 
      lowercase.includes('restored') || 
      lowercase.includes('saved')
    ) {
      return 'success';
    }
    if (
      lowercase.includes('blocked') || 
      lowercase.includes('error') || 
      lowercase.includes('failed') || 
      lowercase.includes('limit') || 
      lowercase.includes('safeguard') || 
      lowercase.includes('cannot') || 
      lowercase.includes('circular') || 
      lowercase.includes('must keep') || 
      lowercase.includes('not supported')
    ) {
      return 'error';
    }
    if (
      lowercase.includes('please') || 
      lowercase.includes('ensure') || 
      lowercase.includes('warning') || 
      lowercase.includes('select')
    ) {
      return 'warning';
    }
    return 'info';
  };

  const addToast = (message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    const type = classifyToast(message);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 2000); // automatically close after 2 seconds!
  };

  useEffect(() => {
    const originalAlert = window.alert;
    window.alert = (message: string) => {
      addToast(message);
    };
    return () => {
      window.alert = originalAlert;
    };
  }, []);

  // Topbar Collapse States
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);

  // Core Vector State
  const [objects, setObjects] = useState<{ [id: string]: VectorObject }>({});
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string>('SEL');
  const [bones, setBones] = useState<Bone[]>([]);
  const [onionSkinEnabled, setOnionSkinEnabled] = useState(true);
  const [showBones, setShowBones] = useState(true);
  const [activeLayerId, setActiveLayerId] = useState<string>('layer_char');

  // Timeline State
  const [frames, setFrames] = useState<Frame[]>([
    { index: 0, objects: {} }
  ]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [fps, setFps] = useState(12);
  const [isPlaying, setIsPlaying] = useState(false);

  // Layers list
  const [layers, setLayers] = useState<Layer[]>([
    { id: 'layer_char', name: 'Character Layer', zIndex: 2, visible: true, locked: false, opacity: 1, blendMode: 'normal' },
    { id: 'layer_bg', name: 'Background Layer', zIndex: 1, visible: true, locked: false, opacity: 1, blendMode: 'normal' }
  ]);

  // Undo/Redo Stacks
  const [undoStack, setUndoStack] = useState<any[]>([]);
  const [redoStack, setRedoStack] = useState<any[]>([]);

  // 360 Studio Interactive Drawing Wizard State
  const [is360WizardActive, setIs360WizardActive] = useState(false);
  const [draft360Views, setDraft360Views] = useState<View360[]>([]);
  const [draftAnchorId, setDraftAnchorId] = useState<string | null>(null);
  const [onionSkinEnabled360, setOnionSkinEnabled360] = useState(true);

  // Smart controls pinned list
  const [smartPinnedIds, setSmartPinnedIds] = useState<string[]>([]);

  // Lasso selection area points state
  const [lassoPoints, setLassoPoints] = useState<Point[]>([]);
  const [lassoMode, setLassoMode] = useState<'freehand' | 'pen'>('freehand');
  const [penLassoPoints, setPenLassoPoints] = useState<Point[]>([]);
  const [fillToolColor, setFillToolColor] = useState<string>('#4CAF50');

  // Brush Custom Settings for lifelike drawing
  const [brushSettings, setBrushSettings] = useState<BrushSettings>({
    brushType: 'solid',
    strokeColor: '#000000',
    strokeWidth: 5,
    strokeOpacity: 1.0,
    hardness: 0.8,
    blur: 0,
    shadowEnabled: false,
    shadowColor: '#000000',
    shadowBlur: 4,
    shadowOffsetX: 2,
    shadowOffsetY: 2,
  });

  // Realism Maker Settings
  const [realismSettings, setRealismSettings] = useState<RealismSettings>({
    autoTaperEnabled: false,
    minThickness: 1.5,
    maxThickness: 8.0,
    thinningFactor: 0.3,
    autoShadingEnabled: false,
    shadingLightAngle: 45,
    shadingHighlightOpacity: 0.2,
    shadingShadowOpacity: 0.3,
    microJitterEnabled: false,
    microJitterAmount: 1.5,
    paperGrainEnabled: false,
    paperGrainIntensity: 0.4,
    inkBleedEnabled: false,
    inkBleedBlur: 3,
    inkBleedOpacity: 0.3,
    inkBleedWidthOffset: 6,
  });

  // Simple Authentication & Animation Database states
  const [currentUser, setCurrentUser] = useState<string | null>(() => {
    return localStorage.getItem('animastudio_current_user');
  });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [savedRecord, setSavedRecord] = useState<SavedAnimationRecord | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [dbNotification, setDbNotification] = useState<{ type: 'success' | 'info' | 'error'; message: string } | null>(null);
  const [limitNotification, setLimitNotification] = useState<string | null>(null);
  const [timelineHeight, setTimelineHeight] = useState<number>(185);
  
  // Theme states
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('animastudio_theme') as 'dark' | 'light') || 'light';
  });

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('animastudio_theme', next);
  };
  const limitTimeoutRef = useRef<any>(null);

  const triggerLimitNotification = () => {
    if (limitTimeoutRef.current) {
      clearTimeout(limitTimeoutRef.current);
    }
    setLimitNotification("you have reached daily limit for 3D mesh please wait for refresh");
    limitTimeoutRef.current = setTimeout(() => {
      setLimitNotification(null);
    }, 2000);
  };

  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);

  // Canvas Size States
  const [artboardW, setArtboardW] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return Math.max(800, window.innerWidth - 64);
    }
    return 1400;
  });
  const [artboardH, setArtboardH] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return Math.max(500, window.innerHeight - 260);
    }
    return 900;
  });
  const [showCanvasSizePanel, setShowCanvasSizePanel] = useState<boolean>(false);

  // Adaptive subdivision control
  const [adaptiveSubdivisionEnabled, setAdaptiveSubdivisionEnabled] = useState<boolean>(false);
  const [adaptiveSubdivisionPoints, setAdaptiveSubdivisionPoints] = useState<number>(3);

  // Window size state for mobile responsive zoom-out container
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800
  });

  // Responsive default setups & exclusive sidebar triggers
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleResize = () => {
        setWindowSize({ width: window.innerWidth, height: window.innerHeight });
        if (window.innerWidth < 1024) {
          setLeftOpen(false);
          setRightOpen(false);
          setToolbarCollapsed(true);
        } else {
          setLeftOpen(true);
          setRightOpen(true);
          setToolbarCollapsed(false);
        }
      };
      // Run once on load
      handleResize();
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }
  }, []);

  // Strict Security Protection Effect (Right-click & DevTools Hotkey block + console warnings)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Prevent context menu (disables right-click)
    const preventContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      setLimitNotification("Security Guard: Right-click is strictly disabled to secure App presets & vector assets.");
    };
    window.addEventListener('contextmenu', preventContextMenu);

    // 2. Prevent Developer tools shortcuts
    const preventDevTools = (e: KeyboardEvent) => {
      // F12
      if (e.key === 'F12' || e.keyCode === 123) {
        e.preventDefault();
        setLimitNotification("Security Guard: Source inspection is locked for safety.");
        return false;
      }
      // Ctrl+Shift+I / J / C or Cmd+Option+I / J / C
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;
      if (isCtrlOrCmd && isShift && (e.key === 'i' || e.key === 'I' || e.key === 'j' || e.key === 'J' || e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        setLimitNotification("Security Guard: Source code inspection and compilation overrides are locked.");
        return false;
      }
      // Ctrl+U / Cmd+Option+U (view source)
      if (isCtrlOrCmd && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault();
        setLimitNotification("Security Guard: View-source operation is blocked.");
        return false;
      }
      // Ctrl+S / Cmd+S (prevent saving page source)
      if (isCtrlOrCmd && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        setLimitNotification("Security Guard: Local file cloning is blocked.");
        return false;
      }
    };
    window.addEventListener('keydown', preventDevTools);

    // 3. Clear console loop or console warn message to prevent script inject hacking
    const warningInterval = setInterval(() => {
      console.clear();
      console.log(
        "%cSECURITY ALERT: CHAVANKRUSHNA ANIMATION WORKSPACE SECURED",
        "color: #f59e0b; font-size: 24px; font-weight: 900; text-shadow: 2px 2px black;"
      );
      console.log(
        "%cAll system compilation tools, bone-riggers, and vector presets are actively secured. Source inspection or unauthorized cloning constitutes a policy violation.",
        "color: #a3a3a3; font-size: 13px;"
      );
    }, 5000);

    return () => {
      window.removeEventListener('contextmenu', preventContextMenu);
      window.removeEventListener('keydown', preventDevTools);
      clearInterval(warningInterval);
    };
  }, []);

  const handleSetLeftOpen = (val: boolean | ((prev: boolean) => boolean)) => {
    setLeftOpen(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      if (next && typeof window !== 'undefined' && window.innerWidth < 1024) {
        setRightOpen(false);
      }
      return next;
    });
  };

  const handleSetRightOpen = (val: boolean | ((prev: boolean) => boolean)) => {
    setRightOpen(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      if (next && typeof window !== 'undefined' && window.innerWidth < 1024) {
        setLeftOpen(false);
      }
      return next;
    });
  };

  // Check user saved records on login or on initial render
  useEffect(() => {
    if (currentUser) {
      const { record, wasDeleted } = getUserAnimation(currentUser);
      if (wasDeleted) {
        setSavedRecord(null);
        setDbNotification({
          type: 'info',
          message: 'Notice: Your previously saved animation was deleted automatically because it was more than 1 day old.'
        });
        setTimeout(() => setDbNotification(null), 8000);
      } else if (record) {
        setSavedRecord(record);
      } else {
        setSavedRecord(null);
      }
    } else {
      setSavedRecord(null);
    }
  }, [currentUser]);

  // Periodic age-check (runs every 10 seconds to auto-expire if the page stays open)
  useEffect(() => {
    const interval = setInterval(() => {
      if (currentUser && savedRecord) {
        const { record, wasDeleted } = getUserAnimation(currentUser);
        if (wasDeleted) {
          setSavedRecord(null);
          setDbNotification({
            type: 'info',
            message: 'Your saved animation has just reached the 1-day threshold and was deleted.'
          });
          setTimeout(() => setDbNotification(null), 6000);
        }
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [currentUser, savedRecord]);

  const handleSaveToDatabase = () => {
    if (!currentUser) {
      setIsAuthModalOpen(true);
      return;
    }

    try {
      const record = saveUserAnimation(currentUser, {
        fps,
        layers,
        objects,
        frames,
        bones,
      });
      setSavedRecord(record);
      setDbNotification({
        type: 'success',
        message: 'Successfully saved current workspace animation to database!'
      });
      setTimeout(() => setDbNotification(null), 4000);
    } catch (e) {
      setDbNotification({
        type: 'error',
        message: 'Failed to save to database.'
      });
      setTimeout(() => setDbNotification(null), 4000);
    }
  };

  const handleLoadFromDatabase = () => {
    if (!currentUser || !savedRecord) return;

    // Run age check first
    const { record, wasDeleted } = getUserAnimation(currentUser);
    if (wasDeleted) {
      setSavedRecord(null);
      setDbNotification({
        type: 'error',
        message: 'Unable to load: Your saved animation expired (older than 1 day) and was deleted.'
      });
      setTimeout(() => setDbNotification(null), 6000);
      return;
    }

    if (record) {
      historyPush();
      if (record.objects) setObjects(JSON.parse(JSON.stringify(record.objects)));
      if (record.bones) setBones(JSON.parse(JSON.stringify(record.bones)));
      if (record.frames) setFrames(JSON.parse(JSON.stringify(record.frames)));
      if (record.layers) setLayers(JSON.parse(JSON.stringify(record.layers)));
      if (record.fps) setFps(record.fps);
      
      setCurrentFrameIndex(0);
      setSelectedObjectId(null);

      setDbNotification({
        type: 'success',
        message: 'Successfully restored saved animation from the database!'
      });
      setTimeout(() => setDbNotification(null), 4000);
    }
  };

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    const res = validateSimpleAuth(authEmail, authPassword);
    if (res.success) {
      const normalizedEmail = authEmail.trim().toLowerCase();
      localStorage.setItem('animastudio_current_user', normalizedEmail);
      setCurrentUser(normalizedEmail);
      setIsAuthModalOpen(false);
      setAuthPassword('');
      
      const { record, wasDeleted } = getUserAnimation(normalizedEmail);
      if (record) {
        setSavedRecord(record);
        setDbNotification({
          type: 'success',
          message: `Logged in as ${normalizedEmail}. Found your saved animation!`
        });
      } else if (wasDeleted) {
        setDbNotification({
          type: 'info',
          message: `Logged in as ${normalizedEmail}. Your previous animation had expired and was auto-deleted.`
        });
      } else {
        setDbNotification({
          type: 'success',
          message: `Logged in as ${normalizedEmail}!`
        });
      }
      setTimeout(() => setDbNotification(null), 5000);
    } else {
      setAuthError(res.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('animastudio_current_user');
    setCurrentUser(null);
    setSavedRecord(null);
    setIsProfileDropdownOpen(false);
    setDbNotification({
      type: 'info',
      message: 'Logged out successfully.'
    });
    setTimeout(() => setDbNotification(null), 3000);
  };

  const handleDeleteSavedAnimation = () => {
    if (currentUser) {
      deleteUserAnimation(currentUser);
      setSavedRecord(null);
      setDbNotification({
        type: 'info',
        message: 'Deleted saved animation from database.'
      });
      setTimeout(() => setDbNotification(null), 3000);
    }
  };

  // Ref to track the currently loaded frame index to prevent race conditions & update loops
  const loadedFrameIndexRef = useRef<number>(0);
  const lastSyncedObjectsRef = useRef<string>('');

  // Keep a stable reference to the frames array to break the feedback loop during rapid dragging
  const framesRef = useRef(frames);
  useEffect(() => {
    framesRef.current = frames;
  }, [frames]);

  // Synchronize active objects back and forth between active frame and objects dictionary
  useEffect(() => {
    // 1. If we changed frame index, we MUST load objects from that target frame
    if (currentFrameIndex !== loadedFrameIndexRef.current) {
      const targetFrame = framesRef.current[currentFrameIndex];
      if (targetFrame) {
        const frameObjects = targetFrame.objects || {};
        const frameObjectsStr = JSON.stringify(frameObjects);
        const currentObjectsStr = JSON.stringify(objects);

        if (currentObjectsStr !== frameObjectsStr) {
          // State has not caught up to the loaded frame objects yet
          setObjects(JSON.parse(frameObjectsStr));
          lastSyncedObjectsRef.current = frameObjectsStr;
          return;
        } else {
          // State has fully caught up! Now we mark it as loaded
          loadedFrameIndexRef.current = currentFrameIndex;
          lastSyncedObjectsRef.current = frameObjectsStr;
          return;
        }
      } else if (currentFrameIndex > 0) {
        // Fallback: copy from previous frame if the current frame is empty or undefined
        const prevFrame = framesRef.current[currentFrameIndex - 1];
        if (prevFrame && prevFrame.objects && Object.keys(prevFrame.objects).length > 0) {
          const copiedObjects = JSON.parse(JSON.stringify(prevFrame.objects));
          const copiedStr = JSON.stringify(copiedObjects);
          const currentObjectsStr = JSON.stringify(objects);

          if (currentObjectsStr !== copiedStr) {
            setObjects(copiedObjects);
            lastSyncedObjectsRef.current = copiedStr;

            setFrames(prev => {
              if (!prev[currentFrameIndex]) return prev;
              const currentFrameObjectsInState = prev[currentFrameIndex].objects || {};
              if (JSON.stringify(currentFrameObjectsInState) !== copiedStr) {
                const updated = [...prev];
                updated[currentFrameIndex] = {
                  ...updated[currentFrameIndex],
                  objects: copiedObjects
                };
                return updated;
              }
              return prev;
            });
            return;
          } else {
            loadedFrameIndexRef.current = currentFrameIndex;
            lastSyncedObjectsRef.current = copiedStr;
            return;
          }
        } else {
          const currentObjectsStr = JSON.stringify(objects);
          if (currentObjectsStr !== '{}') {
            setObjects({});
            lastSyncedObjectsRef.current = '{}';
            return;
          } else {
            loadedFrameIndexRef.current = currentFrameIndex;
            lastSyncedObjectsRef.current = '{}';
            return;
          }
        }
      } else {
        const currentObjectsStr = JSON.stringify(objects);
        if (currentObjectsStr !== '{}') {
          setObjects({});
          lastSyncedObjectsRef.current = '{}';
          return;
        } else {
          loadedFrameIndexRef.current = currentFrameIndex;
          lastSyncedObjectsRef.current = '{}';
          return;
        }
      }
    } else {
      // 2. Otherwise, we are on the same frame, so sync any changes in 'objects' back to 'frames'
      const currentObjectsStr = JSON.stringify(objects);
      // If it matches our last synchronized string, skip synchronization to prevent loops!
      if (currentObjectsStr === lastSyncedObjectsRef.current) {
        return;
      }

      // Debounce updating frames during rapid actions like dragging or drawing to completely eliminate infinite update loops!
      const handler = setTimeout(() => {
        const checkStr = JSON.stringify(objects);
        if (checkStr !== lastSyncedObjectsRef.current) {
          lastSyncedObjectsRef.current = checkStr;
          
          setFrames(prev => {
            if (!prev[currentFrameIndex]) return prev;
            const currentFrameObjectsInState = prev[currentFrameIndex].objects || {};
            
            const currentKeys = Object.keys(objects);
            const savedKeys = Object.keys(currentFrameObjectsInState);
            
            const addedKeys = currentKeys.filter(k => !savedKeys.includes(k));
            const deletedKeys = savedKeys.filter(k => !currentKeys.includes(k));
            
            if (addedKeys.length > 0 || deletedKeys.length > 0 || 
                JSON.stringify(currentFrameObjectsInState) !== checkStr) {
              
              const updated = prev.map((f, idx) => {
                const frameObjects = JSON.parse(JSON.stringify(f.objects || {})); // Deep clone to prevent direct state mutation!
                
                // Delete deleted objects from all frames
                deletedKeys.forEach(k => {
                  delete frameObjects[k];
                });
                
                // Sync new objects to all frames
                addedKeys.forEach(k => {
                  frameObjects[k] = JSON.parse(JSON.stringify(objects[k]));
                });

                // Sync existing objects' style, color, drawing structure, and text properties to all other frames
                Object.keys(frameObjects).forEach(k => {
                  if (objects[k]) {
                    const src = objects[k];
                    const dest = frameObjects[k];
                    
                    if (src.strokeColor !== undefined) dest.strokeColor = src.strokeColor;
                    if (src.strokeWidth !== undefined) dest.strokeWidth = src.strokeWidth;
                    if (src.fillColor !== undefined) dest.fillColor = src.fillColor;
                    if (src.lassoFills !== undefined) dest.lassoFills = JSON.parse(JSON.stringify(src.lassoFills));
                    if (src.opacity !== undefined) dest.opacity = src.opacity;
                    if (src.shadow !== undefined) dest.shadow = src.shadow ? JSON.parse(JSON.stringify(src.shadow)) : undefined;
                    if (src.innerShadow !== undefined) dest.innerShadow = src.innerShadow ? JSON.parse(JSON.stringify(src.innerShadow)) : undefined;
                    if (src.rimLight !== undefined) dest.rimLight = src.rimLight ? JSON.parse(JSON.stringify(src.rimLight)) : undefined;
                    if (src.overlay !== undefined) dest.overlay = src.overlay ? JSON.parse(JSON.stringify(src.overlay)) : undefined;
                    
                    if (src.points !== undefined) dest.points = JSON.parse(JSON.stringify(src.points));
                    if (src.subPaths !== undefined) dest.subPaths = src.subPaths ? JSON.parse(JSON.stringify(src.subPaths)) : undefined;
                    if (src.name !== undefined) dest.name = src.name;
                    if (src.type !== undefined) dest.type = src.type;
                    if (src.text !== undefined) dest.text = src.text;
                    if (src.fontSize !== undefined) dest.fontSize = src.fontSize;
                    if (src.fontFamily !== undefined) dest.fontFamily = src.fontFamily;
                    if (src.imageUrl !== undefined) dest.imageUrl = src.imageUrl;
                    
                    if (src.isLocked !== undefined) dest.isLocked = src.isLocked;
                    if (src.isHidden !== undefined) dest.isHidden = src.isHidden;
                    if (src.zIndex !== undefined) dest.zIndex = src.zIndex;
                    
                    if (src.keepAttachedTo !== undefined) dest.keepAttachedTo = src.keepAttachedTo;
                    if (src.attachedGroupId !== undefined) dest.attachedGroupId = src.attachedGroupId;
                    if (src.parentId !== undefined) dest.parentId = src.parentId;
                    if (src.childrenIds !== undefined) dest.childrenIds = src.childrenIds ? JSON.parse(JSON.stringify(src.childrenIds)) : undefined;
                    if (src.layerId !== undefined) dest.layerId = src.layerId;
                    
                    if (src.meshState !== undefined) dest.meshState = src.meshState ? JSON.parse(JSON.stringify(src.meshState)) : undefined;
                    if (src.depth3D !== undefined) dest.depth3D = src.depth3D;
                    if (src.hollowEnabled !== undefined) dest.hollowEnabled = src.hollowEnabled;
                    if (src.innerSpace3D !== undefined) dest.innerSpace3D = src.innerSpace3D;
                    if (src.selectedFaceIndex !== undefined) dest.selectedFaceIndex = src.selectedFaceIndex;
                    if (src.selectedEdgeIndex !== undefined) dest.selectedEdgeIndex = src.selectedEdgeIndex;
                    if (src.shape3DType !== undefined) dest.shape3DType = src.shape3DType;
                    if (src.smartWarp !== undefined) dest.smartWarp = src.smartWarp ? JSON.parse(JSON.stringify(src.smartWarp)) : undefined;
                    if (src.pins !== undefined) dest.pins = src.pins ? JSON.parse(JSON.stringify(src.pins)) : undefined;
                    if (src.pivots !== undefined) dest.pivots = src.pivots ? JSON.parse(JSON.stringify(src.pivots)) : undefined;
                  }
                });
                
                if (idx === currentFrameIndex) {
                  return {
                    ...f,
                    objects: JSON.parse(checkStr)
                  };
                } else {
                  return {
                    ...f,
                    objects: frameObjects
                  };
                }
              });
              
              return updated;
            }
            return prev;
          });
        }
      }, 150);

      return () => clearTimeout(handler);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFrameIndex, objects]);

  // Export video recorder states
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Push to history helper
  const historyPush = () => {
    const stateSnapshot = {
      objects: JSON.parse(JSON.stringify(objects)),
      bones: JSON.parse(JSON.stringify(bones)),
    };
    setUndoStack(prev => [...prev.slice(-15), stateSnapshot]); // Limit memory stack to 15 actions
    setRedoStack([]);
  };

  // Powerful transform-propagating update helper
  const updateObject = (id: string, updates: Partial<VectorObject>) => {
    setObjects(prev => {
      const updated = { ...prev };
      const obj = updated[id];
      if (!obj) return prev;

      const updatedObj = { ...obj, ...updates };
      updated[id] = updatedObj;

      // If transform changed, propagate down the parent-child hierarchy!
      if (updates.transform) {
        const origT = obj.transform;
        const newT = updates.transform;

        const dX = (newT.x !== undefined ? newT.x : origT.x) - origT.x;
        const dY = (newT.y !== undefined ? newT.y : origT.y) - origT.y;
        const dRot = ((newT.rotation !== undefined ? newT.rotation : origT.rotation) ?? 0) - (origT.rotation ?? 0);
        
        const sXRatio = origT.scaleX !== 0 ? (newT.scaleX !== undefined ? newT.scaleX : origT.scaleX ?? 1) / origT.scaleX : 1;
        const sYRatio = origT.scaleY !== 0 ? (newT.scaleY !== undefined ? newT.scaleY : origT.scaleY ?? 1) / origT.scaleY : 1;

        // Propagate recursively
        const propagate = (parentId: string, deltaX: number, deltaY: number, deltaRot: number, scaleXRatio: number, scaleYRatio: number) => {
          // Get direct child IDs
          const childIds = Object.keys(updated).filter(k => updated[k].parentId === parentId);

          for (const childId of childIds) {
            const child = updated[childId];
            if (!child) continue;

            const childOrigT = { ...child.transform };
            const childNewT = { ...child.transform };

            // Rotate child position around parent's pivot
            if (deltaRot !== 0) {
              const parentObj = updated[parentId];
              const pPivot = parentObj?.pivots?.[0] || { localX: 0, localY: 0 };
              const parentJointWorld = localToWorld(
                { x: pPivot.localX, y: pPivot.localY },
                parentObj.transform,
                pPivot
              );
              const childWorldPos = { x: childNewT.x, y: childNewT.y };
              const rotatedChildWorldPos = rotatePoint(childWorldPos, deltaRot, parentJointWorld);
              childNewT.x = Number(rotatedChildWorldPos.x.toFixed(2));
              childNewT.y = Number(rotatedChildWorldPos.y.toFixed(2));
              childNewT.rotation = Number(((childNewT.rotation ?? 0) + deltaRot).toFixed(2));
            } else {
              // Just translate
              childNewT.x = Number((childNewT.x + deltaX).toFixed(2));
              childNewT.y = Number((childNewT.y + deltaY).toFixed(2));
            }

            // Scale child's offset and scale factors
            if (scaleXRatio !== 1 || scaleYRatio !== 1) {
              const parentObj = updated[parentId];
              const pPivot = parentObj?.pivots?.[0] || { localX: 0, localY: 0 };
              const parentJointWorld = localToWorld(
                { x: pPivot.localX, y: pPivot.localY },
                parentObj.transform,
                pPivot
              );
              const dx_c = childNewT.x - parentJointWorld.x;
              const dy_c = childNewT.y - parentJointWorld.y;
              childNewT.x = Number((parentJointWorld.x + dx_c * scaleXRatio).toFixed(2));
              childNewT.y = Number((parentJointWorld.y + dy_c * scaleYRatio).toFixed(2));
              childNewT.scaleX = Number(((childNewT.scaleX ?? 1) * scaleXRatio).toFixed(2));
              childNewT.scaleY = Number(((childNewT.scaleY ?? 1) * scaleYRatio).toFixed(2));
            }

            // Propagate Skew, RotateX, RotateY, Perspective if present
            if (newT.skewX !== undefined) {
              const dSkewX = (newT.skewX ?? 0) - (origT.skewX ?? 0);
              childNewT.skewX = Number(((childNewT.skewX ?? 0) + dSkewX).toFixed(2));
            }
            if (newT.skewY !== undefined) {
              const dSkewY = (newT.skewY ?? 0) - (origT.skewY ?? 0);
              childNewT.skewY = Number(((childNewT.skewY ?? 0) + dSkewY).toFixed(2));
            }
            if (newT.rotateX !== undefined) {
              const dRotX = (newT.rotateX ?? 0) - (origT.origX ?? origT.rotateX ?? 0);
              childNewT.rotateX = Number(((childNewT.rotateX ?? 0) + dRotX).toFixed(2));
            }
            if (newT.rotateY !== undefined) {
              const dRotY = (newT.rotateY ?? 0) - (origT.origY ?? origT.rotateY ?? 0);
              childNewT.rotateY = Number(((childNewT.rotateY ?? 0) + dRotY).toFixed(2));
            }
            if (newT.perspective !== undefined) {
              const dPersp = (newT.perspective ?? 0) - (origT.perspective ?? 0);
              childNewT.perspective = Number(((childNewT.perspective ?? 0) + dPersp).toFixed(2));
            }

            // Snapping rigid bones to guarantee zero detachment
            const parentObj = updated[parentId];
            const associatedBone = bones.find(b => b.startObjectId === parentId && b.endObjectId === childId);
            if (associatedBone && !associatedBone.allowDetach) {
              const pJoint = localToWorld({ x: associatedBone.startLocalX, y: associatedBone.startLocalY }, parentObj.transform, parentObj.pivots?.[0]);
              const cJoint = localToWorld({ x: associatedBone.endLocalX, y: associatedBone.endLocalY }, childNewT, child.pivots?.[0]);
              
              const dx_snap = pJoint.x - cJoint.x;
              const dy_snap = pJoint.y - cJoint.y;

              childNewT.x = Number((childNewT.x + dx_snap).toFixed(2));
              childNewT.y = Number((childNewT.y + dy_snap).toFixed(2));
            }

            updated[childId] = {
              ...child,
              transform: childNewT
            };

            // Recursive propagation down the chain
            const nextDX = childNewT.x - childOrigT.x;
            const nextDY = childNewT.y - childOrigT.y;
            const nextDRot = (childNewT.rotation ?? 0) - (childOrigT.rotation ?? 0);
            const nextSXRatio = childOrigT.scaleX !== 0 ? (childNewT.scaleX ?? 1) / childOrigT.scaleX : 1;
            const nextSYRatio = childOrigT.scaleY !== 0 ? (childNewT.scaleY ?? 1) / childOrigT.scaleY : 1;

            propagate(childId, nextDX, nextDY, nextDRot, nextSXRatio, nextSYRatio);
          }
        };

        // 1. Instantly propagate translation for permanently attached sibling group
        if (obj.attachedGroupId && (dX !== 0 || dY !== 0)) {
          Object.keys(updated).forEach(k => {
            if (k !== id && updated[k].attachedGroupId === obj.attachedGroupId) {
              const sibling = updated[k];
              const siblingOrigT = { ...sibling.transform };
              const siblingNewT = {
                ...sibling.transform,
                x: Number((sibling.transform.x + dX).toFixed(2)),
                y: Number((sibling.transform.y + dY).toFixed(2))
              };
              updated[k] = {
                ...sibling,
                transform: siblingNewT
              };

              // Propagate hierarchical transformations down from each sibling
              propagate(k, dX, dY, 0, 1, 1);
            }
          });
        }

        // 2. Propagate parent-child hierarchies from the modified object
        propagate(id, dX, dY, dRot, sXRatio, sYRatio);
      }

      return updated;
    });
  };

  const duplicateObject = (id: string, offset = { x: 30, y: 30 }) => {
    try {
      const original = objects[id];
      if (!original) {
        alert("Duplication Error: The selected drawing could not be found.");
        return null;
      }

      historyPush();

      const newId = `obj_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      
      const newPivots = original.pivots.map(p => ({
        ...p,
        id: `pvt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
      }));

      const newPins = original.pins ? original.pins.map(p => ({
        ...p,
        id: `pvt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
      })) : undefined;

      const newObj: VectorObject = {
        ...original,
        id: newId,
        name: `${original.name}_copy`,
        points: original.points ? original.points.map(p => ({ ...p })) : [],
        subPaths: original.subPaths ? original.subPaths.map(path => path.map(p => ({ ...p }))) : undefined,
        pivots: newPivots,
        pins: newPins,
        transform: {
          ...original.transform,
          x: original.transform.x + offset.x,
          y: original.transform.y + offset.y
        },
        parentId: null,
        childrenIds: []
      };

      setObjects(prev => ({
        ...prev,
        [newId]: newObj
      }));

      setSelectedObjectId(newId);
      return newId;
    } catch (err: any) {
      console.error("Duplication error:", err);
      alert(`Failed to duplicate drawing: ${err.message || err}`);
      return null;
    }
  };

  const isPointInPolygonLocal = (p: Point, polygon: Point[]): boolean => {
    if (polygon.length < 3) return false;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      const intersect = ((yi > p.y) !== (yj > p.y))
          && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const getObjectWorldCenterLocal = (obj: VectorObject) => {
    if (obj.pivots && obj.pivots.length > 0) {
      const pvt = obj.pivots[0];
      return {
        x: obj.transform.x + pvt.localX,
        y: obj.transform.y + pvt.localY
      };
    }
    if (obj.points && obj.points.length > 0) {
      let sumX = 0;
      let sumY = 0;
      obj.points.forEach(p => {
        sumX += p.x;
        sumY += p.y;
      });
      return {
        x: obj.transform.x + sumX / obj.points.length,
        y: obj.transform.y + sumY / obj.points.length
      };
    }
    return { x: obj.transform.x, y: obj.transform.y };
  };

  const duplicateLassoBatch = () => {
    try {
      if (!lassoPoints || lassoPoints.length < 3) {
        alert("Please draw a closed lasso loop around the drawings you wish to duplicate.");
        return;
      }

      const targets = (Object.values(objects) as VectorObject[]).filter(obj => {
        if (obj.isHidden || obj.isLocked) return false;
        if (obj.type === '360_container') return false; // skip containers
        const center = getObjectWorldCenterLocal(obj);
        return isPointInPolygonLocal(center, lassoPoints);
      });

      if (targets.length === 0) {
        alert("No active drawings found inside the lasso selection loop! Ensure the target drawings are visible and unlocked.");
        return;
      }

      historyPush();

      const newObjects: { [id: string]: VectorObject } = {};
      const duplicatedIds: string[] = [];

      targets.forEach((original, index) => {
        const newId = `obj_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`;
        const newPivots = original.pivots.map(p => ({
          ...p,
          id: `pvt_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`
        }));
        const newPins = original.pins ? original.pins.map(p => ({
          ...p,
          id: `pvt_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`
        })) : undefined;

        const newObj: VectorObject = {
          ...original,
          id: newId,
          name: `${original.name}_copy`,
          points: original.points ? original.points.map(p => ({ ...p })) : [],
          subPaths: original.subPaths ? original.subPaths.map(path => path.map(p => ({ ...p }))) : undefined,
          pivots: newPivots,
          pins: newPins,
          transform: {
            ...original.transform,
            x: original.transform.x + 40,
            y: original.transform.y + 40
          },
          parentId: null,
          childrenIds: []
        };

        newObjects[newId] = newObj;
        duplicatedIds.push(newId);
      });

      setObjects(prev => ({
        ...prev,
        ...newObjects
      }));

      if (duplicatedIds.length > 0) {
        setSelectedObjectId(duplicatedIds[0]);
      }
      
      // Clear lasso points to complete action
      setLassoPoints([]);
      
      alert(`Successfully duplicated ${targets.length} drawings in batch!`);
    } catch (err: any) {
      console.error("Batch duplication error:", err);
      alert(`Failed to complete batch duplication: ${err.message || err}`);
    }
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    const current = {
      objects: JSON.parse(JSON.stringify(objects)),
      bones: JSON.parse(JSON.stringify(bones)),
    };
    setRedoStack(prev => [...prev, current]);
    setObjects(previous.objects);
    setBones(previous.bones);
    setUndoStack(prev => prev.slice(0, -1));
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    const current = {
      objects: JSON.parse(JSON.stringify(objects)),
      bones: JSON.parse(JSON.stringify(bones)),
    };
    setUndoStack(prev => [...prev, current]);
    setObjects(next.objects);
    setBones(next.bones);
    setRedoStack(prev => prev.slice(0, -1));
  };

  // Toggle Smart Control Pinned State
  const toggleSmartPin = (id: string) => {
    setSmartPinnedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Add a fully pre-rigged sample character for instant user testing!
  const addSampleCharacter = () => {
    historyPush();
    const torsoId = `torso_${Date.now()}`;
    const headId = `head_${Date.now()}`;
    const leftArmId = `left_arm_${Date.now()}`;
    const rightArmId = `right_arm_${Date.now()}`;
    const leftLegId = `left_leg_${Date.now()}`;
    const rightLegId = `right_leg_${Date.now()}`;

    const sampleObjects: { [id: string]: VectorObject } = {
      [torsoId]: {
        id: torsoId,
        name: 'Torso',
        type: 'shape',
        shapeType: 'rectangle',
        points: [
          { x: 120, y: 180 },
          { x: 180, y: 180 },
          { x: 180, y: 280 },
          { x: 120, y: 280 },
          { x: 120, y: 180 }
        ],
        strokeColor: '#1B5E20',
        strokeWidth: 3,
        fillColor: '#C8E6C9',
        opacity: 1,
        transform: { x: 300, y: 100, rotation: 0, scaleX: 1, scaleY: 1 },
        pivots: [{ id: `pvt_${Date.now()}_1`, name: 'BaseJoint', localX: 150, localY: 280, locked: false }],
        parentId: null,
        childrenIds: [headId, leftArmId, rightArmId, leftLegId, rightLegId],
        layerId: 'layer_char',
        isLocked: false,
        isHidden: false,
      },
      [headId]: {
        id: headId,
        name: 'Head',
        type: 'shape',
        shapeType: 'circle',
        points: [
          { x: 130, y: 100 },
          { x: 170, y: 100 },
          { x: 170, y: 140 },
          { x: 130, y: 140 },
          { x: 130, y: 100 }
        ],
        strokeColor: '#1B5E20',
        strokeWidth: 3,
        fillColor: '#FFE082',
        opacity: 1,
        transform: { x: 300, y: 100, rotation: 0, scaleX: 1, scaleY: 1 },
        pivots: [{ id: `pvt_${Date.now()}_2`, name: 'NeckJoint', localX: 150, localY: 175, locked: false }],
        parentId: torsoId,
        childrenIds: [],
        layerId: 'layer_char',
        isLocked: false,
        isHidden: false,
      },
      [leftArmId]: {
        id: leftArmId,
        name: 'LeftArm',
        type: 'shape',
        shapeType: 'line',
        points: [
          { x: 100, y: 190 },
          { x: 70, y: 230 },
          { x: 60, y: 270 }
        ],
        strokeColor: '#E65100',
        strokeWidth: 4,
        fillColor: 'transparent',
        opacity: 1,
        transform: { x: 300, y: 100, rotation: 0, scaleX: 1, scaleY: 1 },
        pivots: [{ id: `pvt_${Date.now()}_3`, name: 'ShoulderJoint', localX: 115, localY: 190, locked: false }],
        parentId: torsoId,
        childrenIds: [],
        layerId: 'layer_char',
        isLocked: false,
        isHidden: false,
      },
      [rightArmId]: {
        id: rightArmId,
        name: 'RightArm',
        type: 'shape',
        shapeType: 'line',
        points: [
          { x: 200, y: 190 },
          { x: 230, y: 230 },
          { x: 240, y: 270 }
        ],
        strokeColor: '#E65100',
        strokeWidth: 4,
        fillColor: 'transparent',
        opacity: 1,
        transform: { x: 300, y: 100, rotation: 0, scaleX: 1, scaleY: 1 },
        pivots: [{ id: `pvt_${Date.now()}_4`, name: 'ShoulderJoint', localX: 185, localY: 190, locked: false }],
        parentId: torsoId,
        childrenIds: [],
        layerId: 'layer_char',
        isLocked: false,
        isHidden: false,
      },
      [leftLegId]: {
        id: leftLegId,
        name: 'LeftLeg',
        type: 'shape',
        shapeType: 'line',
        points: [
          { x: 130, y: 280 },
          { x: 130, y: 340 },
          { x: 125, y: 380 }
        ],
        strokeColor: '#0D47A1',
        strokeWidth: 4.5,
        fillColor: 'transparent',
        opacity: 1,
        transform: { x: 300, y: 100, rotation: 0, scaleX: 1, scaleY: 1 },
        pivots: [{ id: `pvt_${Date.now()}_5`, name: 'HipJoint', localX: 130, localY: 280, locked: false }],
        parentId: torsoId,
        childrenIds: [],
        layerId: 'layer_char',
        isLocked: false,
        isHidden: false,
      },
      [rightLegId]: {
        id: rightLegId,
        name: 'RightLeg',
        type: 'shape',
        shapeType: 'line',
        points: [
          { x: 170, y: 280 },
          { x: 170, y: 340 },
          { x: 175, y: 380 }
        ],
        strokeColor: '#0D47A1',
        strokeWidth: 4.5,
        fillColor: 'transparent',
        opacity: 1,
        transform: { x: 300, y: 100, rotation: 0, scaleX: 1, scaleY: 1 },
        pivots: [{ id: `pvt_${Date.now()}_6`, name: 'HipJoint', localX: 170, localY: 280, locked: false }],
        parentId: torsoId,
        childrenIds: [],
        layerId: 'layer_char',
        isLocked: false,
        isHidden: false,
      }
    };

    // Pre-create bones links for realistic joint kinematics solver!
    const sampleBones: Bone[] = [
      {
        id: 'bone_spine',
        name: 'Spine_Bone',
        startObjectId: torsoId,
        endObjectId: headId,
        startLocalX: 150,
        startLocalY: 180,
        endLocalX: 150,
        endLocalY: 175,
        lockedDistance: 10,
        allowDetach: false,
        minAngle: -45,
        maxAngle: 45,
        enableConstraints: true,
      },
      {
        id: 'bone_larm',
        name: 'Left_Arm_Bone',
        startObjectId: torsoId,
        endObjectId: leftArmId,
        startLocalX: 120,
        startLocalY: 190,
        endLocalX: 115,
        endLocalY: 190,
        lockedDistance: 10,
        allowDetach: false,
        minAngle: -120,
        maxAngle: 120,
        enableConstraints: true,
      }
    ];

    setObjects(sampleObjects);
    setBones(sampleBones);
    setSmartPinnedIds([leftArmId, rightArmId, leftLegId, rightLegId]);
    setSelectedObjectId(torsoId);
  };

  // Add 3D Proxy Model into the animation canvas with strict limits
  const add3DModel = (type: 'car' | 'character' | 'chair' | 'sphere' | 'box' | 'sword') => {
    // 1. Scene Limit: Max 3 active 3D models to guarantee 60 FPS performance and avoid lagging
    const existing3D = (Object.values(objects) as VectorObject[]).filter(obj => obj.type === '3d');
    if (existing3D.length >= 3) {
      alert("App Safety Safeguard: Maximum of 3 active 3D models allowed per project to ensure optimal 60 FPS rendering and completely prevent browser crash conditions.");
      return;
    }

    // 2. Daily Limit: Max 10 3D models added per day per user/guest
    const email = currentUser || 'guest';
    const limitStatus = getDailyLimitStatus(email);
    if (!limitStatus.allowed) {
      triggerLimitNotification();
      return;
    }

    historyPush();
    incrementDailyLimit(email);

    // Generate local mesh data from library
    const geom = generate3DGeometry(type);

    const modelId = `obj_3d_${Date.now()}`;
    const new3DObj: VectorObject = {
      id: modelId,
      name: `3D_${type.toUpperCase()}_Proxy`,
      type: '3d',
      shape3DType: type,
      points: [
        { x: -50, y: -50 },
        { x: 50, y: -50 },
        { x: 50, y: 50 },
        { x: -50, y: 50 },
        { x: -50, y: -50 }
      ], // 2D proxy projection footprint
      strokeColor: '#F59E0B',
      strokeWidth: 2.5,
      fillColor: '#F59E0B',
      opacity: 1,
      transform: { x: 300, y: 250, rotation: 0, scaleX: 1, scaleY: 1 },
      transform3D: {
        x: 0,
        y: 0,
        z: 0,
        rx: 15, // default pitch
        ry: 45, // default yaw
        rz: 0,  // default roll
        sx: 1.5,
        sy: 1.5,
        sz: 1.5,
      },
      vertices3D: geom.vertices,
      faces3D: geom.faces,
      bones3D: geom.bones,
      pivots: [{ id: `pvt_${Date.now()}_3d`, name: 'CenterJoint', localX: 0, localY: 0, locked: false }],
      parentId: null,
      childrenIds: [],
      layerId: activeLayerId,
      isLocked: false,
      isHidden: false,
    };

    setObjects(prev => ({ ...prev, [modelId]: new3DObj }));
    setSelectedObjectId(modelId);
  };

  const add360Object = (selectedIds: string[]) => {
    if (selectedIds.length === 0) {
      alert("Please select one or more drawings to convert into a Master 360 Object.");
      return;
    }
    
    // Check if some are already 360 containers to avoid nested containers
    const validIds = selectedIds.filter(id => objects[id] && objects[id].type !== '360_container');
    if (validIds.length === 0) {
      alert("Please select valid non-container drawings to combine into a Master 360 Object.");
      return;
    }

    const views: View360[] = [];
    validIds.forEach((id, idx) => {
      const angle = Math.round((idx * 360) / validIds.length) % 360;
      views.push({
        id: `view_${Date.now()}_${idx}`,
        angle,
        drawingId: id,
        name: idx === 0 ? 'Front' : idx === 1 && validIds.length === 2 ? 'Back' : `Angle ${angle}°`,
        drawingName: objects[id]?.name || `Drawing ${idx + 1}`
      });
      // Hide the individual drawings on the canvas so they only render inside the master container
      updateObject(id, { isHidden: true });
    });
    
    const containerId = `360_container_${Date.now()}`;
    // Find average position
    let sumX = 0, sumY = 0;
    validIds.forEach(id => {
      sumX += objects[id]?.transform.x ?? 300;
      sumY += objects[id]?.transform.y ?? 250;
    });
    const avgX = sumX / validIds.length;
    const avgY = sumY / validIds.length;
    
    const new360Obj: VectorObject = {
      id: containerId,
      name: `Master_360_Object`,
      type: '360_container',
      views360: views,
      currentAngle360: 0,
      activeViewId360: views[0]?.id || '',
      lockAngle360: false,
      points: [
        { x: -60, y: -60 },
        { x: 60, y: -60 },
        { x: 60, y: 60 },
        { x: -60, y: 60 },
        { x: -60, y: -60 }
      ],
      strokeColor: '#F59E0B',
      strokeWidth: 2,
      fillColor: 'transparent',
      opacity: 1,
      transform: { x: avgX, y: avgY, rotation: 0, scaleX: 1, scaleY: 1 },
      pivots: [{ id: `pvt_${Date.now()}_360`, name: 'RootPivot', localX: 0, localY: 0, locked: false }],
      parentId: null,
      childrenIds: [],
      layerId: activeLayerId,
      isLocked: false,
      isHidden: false,
    };
    
    historyPush();
    setObjects(prev => ({
      ...prev,
      [containerId]: new360Obj
    }));
    setSelectedObjectId(containerId);
  };

  const start360Wizard = () => {
    setIs360WizardActive(true);
    setDraft360Views([]);
    setDraftAnchorId(null);
  };

  const addDraft360View = (drawingId: string, name: string, angle: number) => {
    if (!objects[drawingId]) return;
    const viewId = `view_${Date.now()}`;
    const newView: View360 = {
      id: viewId,
      name,
      angle: angle % 360,
      drawingId,
      drawingName: objects[drawingId].name
    };
    
    // Hide drawing temporarily so they can draw the next one at the exact same spot without clutter
    setObjects(prev => ({
      ...prev,
      [drawingId]: { ...prev[drawingId], isHidden: true }
    }));
    
    setDraft360Views(prev => [...prev, newView]);
    if (!draftAnchorId) {
      setDraftAnchorId(drawingId);
    }
  };

  const cancel360Wizard = () => {
    setObjects(prev => {
      const next = { ...prev };
      draft360Views.forEach(v => {
        if (next[v.drawingId]) {
          next[v.drawingId] = { ...next[v.drawingId], isHidden: false };
        }
      });
      return next;
    });
    setIs360WizardActive(false);
    setDraft360Views([]);
    setDraftAnchorId(null);
  };

  const compile360Wizard = (containerName: string) => {
    if (draft360Views.length === 0) {
      alert("Please add at least one view before compiling.");
      return;
    }
    const anchorId = draftAnchorId || draft360Views[0].drawingId;
    const anchorDrawing = objects[anchorId];
    if (!anchorDrawing) return;

    // Center of anchor
    const boundsAnchor = calculateBoundingBox(anchorDrawing.points);
    const txAnchor = anchorDrawing.transform.x;
    const tyAnchor = anchorDrawing.transform.y;
    const avgX = (boundsAnchor.x + boundsAnchor.width / 2) + txAnchor;
    const avgY = (boundsAnchor.y + boundsAnchor.height / 2) + tyAnchor;

    const containerId = `360_container_${Date.now()}`;
    
    const new360Obj: VectorObject = {
      id: containerId,
      name: containerName || `Master_360_Object`,
      type: '360_container',
      views360: [...draft360Views],
      currentAngle360: 0,
      activeViewId360: draft360Views[0].id,
      lockAngle360: false,
      points: [
        { x: -60, y: -60 },
        { x: 60, y: -60 },
        { x: 60, y: 60 },
        { x: -60, y: 60 },
        { x: -60, y: -60 }
      ],
      strokeColor: '#F59E0B',
      strokeWidth: 2,
      fillColor: 'transparent',
      opacity: 1,
      transform: { x: avgX, y: avgY, rotation: 0, scaleX: 1, scaleY: 1 },
      pivots: [{ id: `pvt_${Date.now()}_360`, name: 'RootPivot', localX: 0, localY: 0, locked: false }],
      parentId: null,
      childrenIds: [],
      layerId: activeLayerId,
      isLocked: false,
      isHidden: false,
    };

    historyPush();
    setObjects(prev => {
      const next = { ...prev };
      draft360Views.forEach(v => {
        if (next[v.drawingId]) {
          next[v.drawingId] = { ...next[v.drawingId], isHidden: true };
        }
      });
      next[containerId] = new360Obj;
      return next;
    });
    setSelectedObjectId(containerId);

    setIs360WizardActive(false);
    setDraft360Views([]);
    setDraftAnchorId(null);
  };

  const addCustom3DModel = (mesh: any, filename: string) => {
    const existing3D = (Object.values(objects) as VectorObject[]).filter(obj => obj.type === '3d');
    if (existing3D.length >= 3) {
      alert("App Safety Safeguard: Maximum of 3 active 3D models allowed per project to ensure optimal 60 FPS rendering and completely prevent browser crash conditions.");
      return;
    }

    const email = currentUser || 'guest';
    const limitStatus = getDailyLimitStatus(email);
    if (!limitStatus.allowed) {
      triggerLimitNotification();
      return;
    }

    historyPush();
    incrementDailyLimit(email);

    const modelId = `obj_3d_${Date.now()}`;
    const new3DObj: VectorObject = {
      id: modelId,
      name: filename.replace(/\.[^/.]+$/, "") + "_Mesh",
      type: '3d',
      shape3DType: 'box',
      points: [
        { x: -50, y: -50 },
        { x: 50, y: -50 },
        { x: 50, y: 50 },
        { x: -50, y: 50 },
        { x: -50, y: -50 }
      ],
      strokeColor: '#F59E0B',
      strokeWidth: 2.0,
      fillColor: '#F59E0B',
      opacity: 1,
      transform: { x: 300, y: 250, rotation: 0, scaleX: 1, scaleY: 1 },
      transform3D: {
        x: 0,
        y: 0,
        z: 0,
        rx: 15,
        ry: 45,
        rz: 0,
        sx: 1.8,
        sy: 1.8,
        sz: 1.8,
      },
      vertices3D: mesh.vertices,
      faces3D: mesh.faces,
      bones3D: mesh.bones || [],
      pivots: [{ id: `pvt_${Date.now()}_3d`, name: 'CenterJoint', localX: 0, localY: 0, locked: false }],
      parentId: null,
      childrenIds: [],
      layerId: activeLayerId,
      isLocked: false,
      isHidden: false,
    };

    setObjects(prev => ({ ...prev, [modelId]: new3DObj }));
    setSelectedObjectId(modelId);
  };

  // Convert 2D Vector Drawing instantly into a real 3D solid wireframe geometry prism
  const convertTo3D = (id: string) => {
    const obj = objects[id];
    if (!obj) return;

    if (obj.type !== 'stroke' && obj.type !== 'shape') {
      alert("Please select a 2D drawing or shape to convert.");
      return;
    }

    const email = currentUser || 'guest';
    const limitStatus = getDailyLimitStatus(email);
    if (!limitStatus.allowed) {
      triggerLimitNotification();
      return;
    }

    historyPush();
    incrementDailyLimit(email);

    // Run extrusion algorithm
    const result = extrude2DTo3D(obj.points, obj.fillColor, obj.strokeColor);

    const updatedObj: VectorObject = {
      ...obj,
      type: '3d',
      shape3DType: 'box', // Extrusion uses box shading logic
      points: [
        { x: -50, y: -50 },
        { x: 50, y: -50 },
        { x: 50, y: 50 },
        { x: -50, y: 50 },
        { x: -50, y: -50 }
      ], // 2D projection footprint box
      strokeColor: obj.strokeColor !== 'transparent' ? obj.strokeColor : '#F59E0B',
      strokeWidth: 2.0,
      fillColor: obj.fillColor !== 'transparent' ? obj.fillColor : '#F59E0B',
      transform: {
        ...obj.transform,
        x: obj.transform.x + result.center.x,
        y: obj.transform.y + result.center.y,
      },
      transform3D: {
        x: 0,
        y: 0,
        z: 0,
        rx: 15,
        ry: 45,
        rz: 0,
        sx: 1.0,
        sy: 1.0,
        sz: 1.0,
      },
      vertices3D: result.vertices,
      faces3D: result.faces,
      bones3D: [],
      originalPointsBackup: obj.points,
      hollowEnabled: false,
      innerSpace3D: 10,
      depth3D: 40,
      pivots: [{ id: `pvt_${Date.now()}_3d`, name: 'CenterJoint', localX: 0, localY: 0, locked: false }],
    };

    setObjects(prev => ({
      ...prev,
      [id]: updatedObj
    }));
    setSelectedObjectId(id);
  };

  // Object and Canvas operations
  const deleteObject = (id: string) => {
    historyPush();
    setObjects(prev => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
    setBones(prev => prev.filter(b => b.startObjectId !== id && b.endObjectId !== id));
    if (selectedObjectId === id) {
      setSelectedObjectId(null);
    }
  };

  const clearCanvas = () => {
    historyPush();
    setObjects({});
    setBones([]);
    setSelectedObjectId(null);
    setFrames([{ index: 0, objects: {} }]);
    setCurrentFrameIndex(0);
  };

  // Timeline operations
  const addFrame = () => {
    if (frames.length >= 500) {
      setLimitNotification("App safety limit: To guarantee 100% lag-free performance, the maximum limit is 500 animation frames per project.");
      return;
    }
    setFrames(prev => [...prev, { index: prev.length, objects: JSON.parse(JSON.stringify(objects)) }]);
  };

  const batchAddFrames = (count: number) => {
    if (frames.length >= 500) {
      setLimitNotification("App safety limit: To guarantee 100% lag-free performance, the maximum limit is 500 animation frames per project.");
      return;
    }
    historyPush();
    setFrames(prev => {
      const updated = [...prev];
      const lastFrame = prev[prev.length - 1];
      const lastFrameObjects = lastFrame ? lastFrame.objects || {} : {};
      
      const spaceLeft = 500 - prev.length;
      const actualToAdd = Math.min(count, spaceLeft);

      if (actualToAdd < count) {
        setLimitNotification(`App safety limit: Truncated batch addition to ${actualToAdd} frames to keep project under the 500-frame ceiling.`);
      }

      for (let i = 0; i < actualToAdd; i++) {
        updated.push({
          index: updated.length,
          objects: JSON.parse(JSON.stringify(lastFrameObjects))
        });
      }
      return updated;
    });
  };

  const deleteFrame = (index: number) => {
    if (frames.length <= 1) return;
    setFrames(prev => prev.filter((_, idx) => idx !== index));
    if (currentFrameIndex >= frames.length - 1) {
      setCurrentFrameIndex(frames.length - 2);
    }
  };

  const duplicateFrame = (index: number) => {
    if (frames.length >= 500) {
      setLimitNotification("App safety limit: To guarantee 100% lag-free performance, the maximum limit is 500 animation frames per project.");
      return;
    }
    const frameToDup = frames[index];
    const newFrame = JSON.parse(JSON.stringify(frameToDup));
    newFrame.index = frames.length;
    setFrames(prev => [...prev, newFrame]);
  };

  const copyFrame = (index: number) => {
    localStorage.setItem('copied_frame_data', JSON.stringify(frames[index].objects));
  };

  const pasteFrame = (index: number) => {
    const data = localStorage.getItem('copied_frame_data');
    if (data) {
      const parsed = JSON.parse(data);
      setFrames(prev => {
        const updated = [...prev];
        updated[index].objects = parsed;
        return updated;
      });
      if (index === currentFrameIndex) {
        setObjects(parsed);
      }
    }
  };

  // Video Export recorder
  const startRecording = () => {
    const canvas = (document.getElementById('front-vector-canvas') as HTMLCanvasElement) || (document.querySelector('canvas') as HTMLCanvasElement);
    if (!canvas) return;

    recordedChunksRef.current = [];
    const stream = canvas.captureStream(fps);
    
    // Check supported types for mp4 vs webm
    let options: MediaRecorderOptions = { mimeType: 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"' };
    let extension = 'mp4';
    
    if (typeof MediaRecorder !== 'undefined') {
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/mp4' };
      }
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm;codecs=h264' };
        extension = 'webm';
      }
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm;codecs=vp9' };
        extension = 'webm';
      }
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm' };
        extension = 'webm';
      }
    } else {
      extension = 'webm';
    }

    try {
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: options.mimeType || 'video/mp4' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Animation_Export_${Date.now()}.${extension}`;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        setIsRecording(false);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setIsPlaying(true); // Auto-start play to capture sequence
    } catch (e) {
      alert("Recording not supported on this browser context.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
  };

  // Import local JSON project file
  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const project = JSON.parse(event.target?.result as string);
        if (project.objects) setObjects(project.objects);
        if (project.bones) setBones(project.bones);
        if (project.frames) {
          let loadedFrames = project.frames;
          if (loadedFrames.length > 500) {
            loadedFrames = loadedFrames.slice(0, 500);
            setLimitNotification("Security warning: Project truncated to 500 frames to guarantee system stability and prevent extreme canvas lag.");
          }
          setFrames(loadedFrames);
        }
        alert("Project loaded successfully!");
      } catch (err) {
        alert("Invalid project JSON layout.");
      }
    };
    reader.readAsText(file);
  };

  // Export local JSON project file
  const handleExportJSON = () => {
    const project = {
      id: `proj_${Date.now()}`,
      name: 'Untitled Project',
      canvasSize: { w: 1000, h: 700 },
      fps,
      layers,
      objects,
      frames,
      bones,
    };

    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Animation_Project_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
  };

  // Upload background-removed PNG image
  const handlePNGUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      const imgId = `obj_png_${Date.now()}`;
      
      const newObj: VectorObject = {
        id: imgId,
        name: `untitledPNG_${Object.keys(objects).length + 1}`,
        type: 'image',
        points: [
          { x: 100, y: 100 },
          { x: 300, y: 100 },
          { x: 300, y: 300 },
          { x: 100, y: 300 },
          { x: 100, y: 100 }
        ],
        strokeColor: 'transparent',
        strokeWidth: 0,
        fillColor: 'transparent',
        opacity: 1,
        transform: { x: 200, y: 150, rotation: 0, scaleX: 1, scaleY: 1 },
        pivots: [{ id: `pvt_${Date.now()}_img`, name: 'BaseJoint', localX: 200, localY: 200, locked: false }],
        parentId: null,
        childrenIds: [],
        layerId: activeLayerId,
        imageUrl: url,
        isLocked: false,
        isHidden: false,
      };

      setObjects(prev => ({ ...prev, [imgId]: newObj }));
      setSelectedObjectId(imgId);
      historyPush();
    };
    reader.readAsDataURL(file);
  };

  const isMobile = windowSize.width < 1200;
  const targetWidth = 1280;
  const scale = isMobile ? windowSize.width / targetWidth : 1;

  if (typeof window !== 'undefined') {
    (window as any).__appScale = scale;
  }

  const containerStyle: React.CSSProperties = isMobile ? {
    width: `${targetWidth}px`,
    height: `${windowSize.height / scale}px`,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    position: 'absolute',
    left: 0,
    top: 0,
  } : {};

  const renderAdBox = (item: AdItem, align: 'top' | 'bottom' = 'bottom') => {
    return (
      <div 
        className="w-full h-full bg-transparent flex items-center justify-center overflow-hidden relative group/ad hover:brightness-110 transition-all duration-300"
        style={{ border: 'none', outline: 'none' }}
      >
        {/* Centered Dynamic Adsterra Iframe Loader */}
        <div className="w-full h-full flex items-center justify-center bg-transparent" style={{ border: 'none', outline: 'none' }}>
          <AdsterraIframe 
            key={`${item.id}-${item.adKey || item.scriptUrl || 'ad'}`}
            adKey={item.adKey} 
            format={item.format} 
            height={item.height} 
            width={item.width} 
            scriptUrl={item.scriptUrl} 
            containerId={item.containerId} 
            align={align}
          />
        </div>
      </div>
    );
  };

  return (
    <div className={`w-screen h-screen overflow-hidden bg-neutral-950 relative ${theme === 'light' ? 'light-theme' : ''}`}>
      <div 
        style={containerStyle}
        className={`flex flex-col h-full w-full bg-neutral-950 text-white font-sans text-sm antialiased overflow-hidden select-none ${theme === 'light' ? 'light-theme' : ''}`}
      >

      {/* 1.5 TOP SPONSOR ADS BAR (2 Boxes, Centered, 76px Height, Spacious Margins) */}
      <div className="w-full bg-transparent p-[2px] flex gap-2 items-center select-none shrink-0 mt-1 mb-2 md:mt-0.5 md:mb-1 px-3 animate-fade-in" id="top-ads-bar" style={{ border: 'none', outline: 'none' }}>
        <div className="flex-1 h-[76px] min-w-0" style={{ border: 'none', outline: 'none' }}>
          {renderAdBox(ADS_DATA[topAdIndex1], 'bottom')}
        </div>
        <div className="flex-1 h-[76px] min-w-0" style={{ border: 'none', outline: 'none' }}>
          {renderAdBox(ADS_DATA[topAdIndex2], 'bottom')}
        </div>
      </div>

      {/* 1. TOP NAVIGATION BAR */}
      <header className="h-14 bg-neutral-900 border-b border-neutral-800 px-2 sm:px-4 flex items-center justify-between shrink-0 select-none z-10 overflow-x-auto scrollbar-none flex-nowrap">
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0 flex-nowrap">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">
            <span className="font-extrabold text-neutral-950 text-xs sm:text-base">A</span>
          </div>
          <div className="block shrink-0">
            <h1 className="font-black text-[9px] sm:text-xs tracking-wider uppercase bg-clip-text text-transparent bg-gradient-to-r from-white to-neutral-400 leading-none">
              Animation
            </h1>
            <p className="text-[7.5px] sm:text-[9px] text-neutral-500 font-extrabold leading-none uppercase tracking-widest mt-0.5">
              VECTOR & RIGGING
            </p>
          </div>
        </div>

        {/* Center Actions: Undo, Redo, Add Sample Character */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0 flex-nowrap mx-2">
          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className={`p-1.5 rounded-xl bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 hover:text-white transition-all shrink-0 ${
              undoStack.length === 0 ? 'opacity-30 cursor-not-allowed' : ''
            }`}
            title="Undo Last Action"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className={`p-1.5 rounded-xl bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 hover:text-white transition-all shrink-0 ${
              redoStack.length === 0 ? 'opacity-30 cursor-not-allowed' : ''
            }`}
            title="Redo"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-6 bg-neutral-800 mx-0.5 sm:mx-1 shrink-0"></div>

          <button
            onClick={addSampleCharacter}
            className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 text-neutral-950 font-black text-[9px] sm:text-xs hover:shadow-lg hover:shadow-amber-500/10 active:scale-95 transition-all cursor-pointer shrink-0"
            title="Rig Sample Character"
          >
            <Sparkles className="w-3 h-3 fill-current shrink-0" />
            <span className="inline">RIG SAMPLE CHARACTER</span>
          </button>

          <button
            onClick={clearCanvas}
            className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-600 border border-rose-500/20 hover:border-rose-500 text-rose-400 hover:text-white font-black text-[9px] sm:text-xs active:scale-95 transition-all cursor-pointer shrink-0"
            title="Clear entire canvas, drawings, bones and timelines"
          >
            <Trash2 className="w-3 h-3 shrink-0" />
            <span className="inline">CLEAR CANVAS</span>
          </button>
        </div>

        {/* Right Actions: Import, Export, Record, Database */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 flex-nowrap">
          {/* Upload PNG */}
          <label className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 font-black text-[9px] sm:text-xs cursor-pointer text-neutral-300 hover:text-white transition-all shrink-0">
            <Upload className="w-3 h-3 shrink-0" />
            <span className="inline">UPLOAD</span>
            <input
              type="file"
              accept="image/png"
              onChange={handlePNGUpload}
              className="hidden"
            />
          </label>

          <div className="w-[1px] h-6 bg-neutral-800 mx-0.5 shrink-0"></div>

          {/* Import / Export JSON */}
          <label className="p-1.5 rounded-xl bg-neutral-850 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 cursor-pointer transition-colors shrink-0" title="Import JSON">
            <Plus className="w-3.5 h-3.5" />
            <input
              type="file"
              accept=".json"
              onChange={handleImportJSON}
              className="hidden"
            />
          </label>
          <button
            onClick={handleExportJSON}
            className="p-1.5 rounded-xl bg-neutral-850 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 transition-colors shrink-0"
            title="Export JSON"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-6 bg-neutral-800 mx-0.5 shrink-0"></div>

          {/* Light/Dark Theme Toggle */}
          <button
            onClick={toggleTheme}
            className={`p-1.5 rounded-xl border transition-all shrink-0 cursor-pointer ${
              theme === 'dark' 
                ? 'bg-neutral-850 hover:bg-neutral-800 text-amber-400 hover:text-amber-300 border-neutral-800' 
                : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-600 hover:text-neutral-900 border-neutral-200'
            }`}
            title={theme === 'dark' ? "Switch to Light Theme" : "Switch to Dark Theme"}
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>

          <div className="w-[1px] h-6 bg-neutral-800 mx-0.5 shrink-0"></div>

          {/* Record Live MP4 Export */}
          {isRecording ? (
            <button
              onClick={stopRecording}
              className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-rose-500 text-white font-black text-[9px] sm:text-xs animate-pulse hover:bg-rose-400 transition-colors cursor-pointer shrink-0"
            >
              <Video className="w-3 h-3 shrink-0" />
              <span className="inline">STOP</span>
            </button>
          ) : (
            <button
              onClick={startRecording}
              className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 font-black text-[9px] sm:text-xs transition-colors cursor-pointer shrink-0"
              title="Record MP4 Animation"
            >
              <Video className="w-3 h-3 shrink-0" />
              <span className="inline">REC</span>
            </button>
          )}

          <div className="w-[1px] h-6 bg-neutral-800 mx-0.5 shrink-0"></div>

          {/* User Icon Auth Trigger */}
          <div className="relative shrink-0" id="user-profile-menu-container">
            {currentUser ? (
              <button
                onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:text-emerald-300 font-bold text-[9px] sm:text-xs transition-colors cursor-pointer select-none shrink-0"
                title={`Logged in as ${currentUser}. Click to open database manager.`}
              >
                <UserCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="max-w-[60px] truncate inline">{currentUser.split('@')[0]}</span>
              </button>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-750 border border-neutral-700 text-neutral-300 hover:text-white font-bold text-[9px] sm:text-xs transition-colors cursor-pointer select-none shrink-0"
                title="Guest Mode. Click here to login to save animations."
              >
                <User className="w-3 h-3 text-neutral-400 shrink-0" />
                <span className="inline">LOGIN</span>
              </button>
            )}

            {/* Profile Dropdown / Saved Animation manager popup */}
            {currentUser && isProfileDropdownOpen && (
              <div className="absolute right-0 mt-2.5 w-72 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl p-4 z-50 text-xs space-y-3.5 animate-fade-in text-neutral-200">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                  <span className="font-extrabold text-neutral-400 uppercase tracking-wider text-[10px]">Your Account</span>
                  <button 
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 text-rose-400 hover:text-rose-300 font-extrabold uppercase text-[9px] bg-rose-500/10 hover:bg-rose-500/20 px-2 py-1 rounded-lg transition-all border border-rose-500/15"
                  >
                    <LogOut className="w-3 h-3 text-rose-400" />
                    Logout
                  </button>
                </div>

                <div className="space-y-1">
                  <span className="text-neutral-500 block font-bold text-[9px] uppercase">Logged in as</span>
                  <span className="text-neutral-200 font-extrabold truncate block text-xs">{currentUser}</span>
                </div>

                {/* Database Animation Section */}
                <div className="bg-neutral-950/60 rounded-xl p-3 border border-neutral-800/60 space-y-2.5">
                  <span className="text-[10px] text-amber-400 font-black uppercase tracking-wider block">💾 Database Storage</span>
                  
                  {savedRecord ? (
                    <div className="space-y-2">
                      <div className="flex items-start gap-2 text-[11px] text-neutral-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-neutral-200">Saved Animation exists</p>
                          <div className="flex items-center gap-1 text-[9px] text-neutral-500 font-medium mt-0.5">
                            <Clock className="w-3 h-3 text-neutral-500" />
                            <span>Saved: {new Date(savedRecord.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <div className="text-[9px] text-amber-500 font-black mt-1">
                            ⚠️ Auto-expires in {Math.max(0, Math.ceil((24 * 60 * 60 * 1000 - (Date.now() - savedRecord.savedAt)) / (60 * 60 * 1000)))} hours
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-neutral-900">
                        <button
                          onClick={handleLoadFromDatabase}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black text-[10px] text-center transition-all uppercase cursor-pointer"
                        >
                          LOAD SAVE
                        </button>
                        <button
                          onClick={handleDeleteSavedAnimation}
                          className="px-2.5 py-1.5 rounded-lg bg-neutral-850 hover:bg-neutral-800 border border-neutral-800 hover:border-rose-500/30 text-neutral-400 hover:text-rose-400 font-bold text-[10px] text-center transition-all uppercase cursor-pointer"
                        >
                          DELETE
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-[10px] text-neutral-500 leading-relaxed">
                        No animation currently saved in your database slot. Saving stores your objects, layers, and timelines for exactly 1 day.
                      </p>
                    </div>
                  )}

                  <button
                    onClick={handleSaveToDatabase}
                    className="w-full py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 text-neutral-950 font-black text-xs text-center hover:shadow-lg hover:shadow-amber-500/10 transition-all uppercase block cursor-pointer"
                  >
                    SAVE CURRENT WORK
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 2. MIDDLE WORKSPACE PANELS AND CANVAS */}
      <div className="flex-1 flex overflow-hidden min-h-0 bg-neutral-950 relative">
        {/* Left Toolbar Column */}
        <Toolbar
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          collapsed={toolbarCollapsed}
          setCollapsed={setToolbarCollapsed}
        />

        {/* Left Collapsible Parenting Hierarchy Tree Panel */}
        <LeftPanel
          objects={objects}
          selectedObjectId={selectedObjectId}
          setSelectedObjectId={setSelectedObjectId}
          updateObject={updateObject}
          deleteObject={deleteObject}
          layers={layers}
          setLayers={setLayers}
          activeLayerId={activeLayerId}
          setActiveLayerId={setActiveLayerId}
          open={leftOpen}
          setOpen={handleSetLeftOpen}
          groupObjects={(ids) => {
            const grpId = `grp_${Date.now()}`;
            alert(`Grouped selected items under parent ID: ${grpId}`);
          }}
          activeTool={activeTool}
          add3DModel={add3DModel}
          addCustom3DModel={addCustom3DModel}
          add360Object={add360Object}
          currentUser={currentUser}
          is360WizardActive={is360WizardActive}
          draft360Views={draft360Views}
          draftAnchorId={draftAnchorId}
          onionSkinEnabled360={onionSkinEnabled360}
          setOnionSkinEnabled360={setOnionSkinEnabled360}
          start360Wizard={start360Wizard}
          addDraft360View={addDraft360View}
          cancel360Wizard={cancel360Wizard}
          compile360Wizard={compile360Wizard}
          adaptiveSubdivisionEnabled={adaptiveSubdivisionEnabled}
          setAdaptiveSubdivisionEnabled={setAdaptiveSubdivisionEnabled}
          adaptiveSubdivisionPoints={adaptiveSubdivisionPoints}
          setAdaptiveSubdivisionPoints={setAdaptiveSubdivisionPoints}
          duplicateObject={duplicateObject}
          duplicateLassoBatch={duplicateLassoBatch}
          lassoPoints={lassoPoints}
          setLassoPoints={setLassoPoints}
          fillToolColor={fillToolColor}
          setFillToolColor={setFillToolColor}
        />

        {/* Central Vector Canvas Area */}
        <CanvasArea
          objects={objects}
          setObjects={setObjects}
          selectedObjectId={selectedObjectId}
          setSelectedObjectId={setSelectedObjectId}
          activeTool={activeTool}
          frames={frames}
          currentFrameIndex={currentFrameIndex}
          bones={bones}
          setBones={setBones}
          activeLayerId={activeLayerId}
          onionSkinEnabled={onionSkinEnabled}
          showBones={showBones}
          isPlaying={isPlaying}
          historyPush={historyPush}
          layers={layers}
          setLayers={setLayers}
          lassoPoints={lassoPoints}
          setLassoPoints={setLassoPoints}
          lassoMode={lassoMode}
          setLassoMode={setLassoMode}
          penLassoPoints={penLassoPoints}
          setPenLassoPoints={setPenLassoPoints}
          realismSettings={realismSettings}
          is360WizardActive={is360WizardActive}
          draft360Views={draft360Views}
          onionSkinEnabled360={onionSkinEnabled360}
          artboardW={artboardW}
          setArtboardW={setArtboardW}
          artboardH={artboardH}
          setArtboardH={setArtboardH}
          showCanvasSizePanel={showCanvasSizePanel}
          setShowCanvasSizePanel={setShowCanvasSizePanel}
          adaptiveSubdivisionEnabled={adaptiveSubdivisionEnabled}
          adaptiveSubdivisionPoints={adaptiveSubdivisionPoints}
          fillToolColor={fillToolColor}
          brushSettings={brushSettings}
          setBrushSettings={setBrushSettings}
        />

        {/* Right Collapsible Properties, Sliders, Smart Pinned Controls */}
        <RightPanel
          selectedObject={selectedObjectId ? objects[selectedObjectId] : null}
          setSelectedObjectId={setSelectedObjectId}
          updateObject={updateObject}
          deleteObject={deleteObject}
          objects={objects}
          bones={bones}
          brushSettings={brushSettings}
          setBrushSettings={setBrushSettings}
          addBone={(bone) => setBones(prev => [...prev, bone])}
          deleteBone={(id) => {
            const targetBone = bones.find(b => b.id === id);
            if (targetBone) {
              const startObj = objects[targetBone.startObjectId];
              const endObj = objects[targetBone.endObjectId];
              if ((startObj && startObj.type === '3d') || (endObj && endObj.type === '3d')) {
                alert("Rigged 3D bone structures are permanently unified for structural integrity to prevent skeleton decoupling.");
                return;
              }
            }
            setBones(prev => prev.filter(b => b.id !== id));
          }}
          updateBone={(id, updates) => {
            setBones(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
          }}
          open={rightOpen}
          setOpen={handleSetRightOpen}
          smartPinnedIds={smartPinnedIds}
          toggleSmartPin={toggleSmartPin}
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          lassoPoints={lassoPoints}
          setLassoPoints={setLassoPoints}
          lassoMode={lassoMode}
          setLassoMode={setLassoMode}
          penLassoPoints={penLassoPoints}
          setPenLassoPoints={setPenLassoPoints}
          frames={frames}
          setFrames={setFrames}
          currentFrameIndex={currentFrameIndex}
          setCurrentFrameIndex={setCurrentFrameIndex}
          setObjects={setObjects}
          fps={fps}
          setFps={setFps}
          realismSettings={realismSettings}
          setRealismSettings={setRealismSettings}
          convertTo3D={convertTo3D}
        />
      </div>

      {/* 2.5 DESKTOP TIMELINE RESIZER BAR */}
      {!isMobile && (
        <div
          className="h-2 bg-neutral-900 hover:bg-amber-500 cursor-ns-resize transition-colors duration-200 flex-shrink-0 relative z-30 select-none group flex items-center justify-center border-t border-b border-neutral-800 hover:border-amber-400"
          onMouseDown={(e) => {
            e.preventDefault();
            const startY = e.clientY;
            const startHeight = timelineHeight;

            const handleMouseMove = (moveEvent: MouseEvent) => {
              const deltaY = moveEvent.clientY - startY;
              const newHeight = Math.max(45, Math.min(550, startHeight - deltaY));
              setTimelineHeight(newHeight);
            };

            const handleMouseUp = () => {
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }}
        >
          {/* Subtle grab bar accent in the center */}
          <div className="w-14 h-1 rounded-full bg-neutral-700 group-hover:bg-amber-300 transition-colors" />
        </div>
      )}

      {/* 3. BOTTOM FRAMES TIMELINE */}
      <Timeline
        frames={frames}
        currentFrameIndex={currentFrameIndex}
        setCurrentFrameIndex={setCurrentFrameIndex}
        addFrame={addFrame}
        deleteFrame={deleteFrame}
        duplicateFrame={duplicateFrame}
        copyFrame={copyFrame}
        pasteFrame={pasteFrame}
        onionSkinEnabled={onionSkinEnabled}
        setOnionSkinEnabled={setOnionSkinEnabled}
        showBones={showBones}
        setShowBones={setShowBones}
        batchAddFrames={batchAddFrames}
        fps={fps}
        setFps={setFps}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        showCanvasSizePanel={showCanvasSizePanel}
        setShowCanvasSizePanel={setShowCanvasSizePanel}
        style={!isMobile ? { height: timelineHeight } : undefined}
      />

      {/* 3.5 BOTTOM SPONSOR ADS BAR (2 Boxes, Centered, 76px Height, Spacious Margins) */}
      {isMobile && (
        <div className="w-full bg-transparent p-[2px] flex gap-2 items-center select-none shrink-0 mt-2 mb-1 px-3 animate-fade-in" id="bottom-ads-bar" style={{ border: 'none', outline: 'none' }}>
          <div className="flex-1 h-[76px] min-w-0" style={{ border: 'none', outline: 'none' }}>
            {renderAdBox(ADS_DATA[bottomAdIndex1], 'top')}
          </div>
          <div className="flex-1 h-[76px] min-w-0" style={{ border: 'none', outline: 'none' }}>
            {renderAdBox(ADS_DATA[bottomAdIndex2], 'top')}
          </div>
        </div>
      )}

      {/* 4. NOTIFICATION & TOAST OVERLAYS */}
      {dbNotification && (
        <div 
          id="db-toast-notification"
          className={`fixed bottom-24 right-6 z-50 flex items-start gap-3 p-4 rounded-2xl shadow-2xl border text-xs max-w-sm animate-fade-in ${
            dbNotification.type === 'success' 
              ? 'bg-emerald-950/95 border-emerald-500/30 text-emerald-300' 
              : dbNotification.type === 'error'
              ? 'bg-rose-950/95 border-rose-500/30 text-rose-300'
              : 'bg-amber-950/95 border-amber-500/30 text-amber-300'
          }`}
        >
          {dbNotification.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
          {dbNotification.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />}
          {dbNotification.type === 'info' && <Clock className="w-5 h-5 text-amber-400 shrink-0 animate-pulse" />}
          <div className="space-y-1">
            <p className="font-extrabold uppercase text-[10px] tracking-wider text-neutral-200">
              {dbNotification.type === 'success' ? 'Database Success' : dbNotification.type === 'error' ? 'Database Alert' : 'System Notice'}
            </p>
            <p className="text-neutral-300 font-medium leading-relaxed">{dbNotification.message}</p>
          </div>
        </div>
      )}

      {/* Daily limit alert toast */}
      {limitNotification && (
        <div 
          id="limit-toast-notification"
          className="fixed bottom-24 right-6 z-50 flex items-start justify-between gap-3 p-4 rounded-2xl shadow-2xl border text-xs max-w-sm animate-fade-in bg-rose-950/95 border-rose-500/30 text-rose-300"
        >
          <div className="flex gap-2.5 items-start">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1 pr-2">
              <p className="font-extrabold uppercase text-[10px] tracking-wider text-rose-200">
                LIMIT REACHED
              </p>
              <p className="text-neutral-200 font-medium leading-relaxed">{limitNotification}</p>
            </div>
          </div>
          <button
            onClick={() => setLimitNotification(null)}
            className="text-rose-400 hover:text-white font-bold p-1 hover:bg-rose-900/40 rounded transition-all shrink-0 cursor-pointer text-[11px]"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
      {/* 5. AUTH MODAL OVERLAY */}
      {isAuthModalOpen && (
        <div 
          id="auth-modal-overlay" 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
        >
          <div className="w-full max-w-md bg-white border border-neutral-200 rounded-2xl shadow-2xl overflow-hidden text-neutral-800">
            {/* Header */}
            <div className="p-5 border-b border-neutral-100 flex items-center justify-between bg-neutral-50">
              <div className="flex items-center gap-2">
                <User className="w-5 h-5 text-amber-600" />
                <h3 className="font-black uppercase tracking-wider text-sm text-neutral-900">Simple Authentication</h3>
              </div>
              <button
                onClick={() => {
                  setIsAuthModalOpen(false);
                  setAuthError('');
                }}
                className="text-neutral-400 hover:text-neutral-700 font-black text-sm p-1.5 hover:bg-neutral-100 rounded-lg transition-all"
              >
                ✕
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleAuthSubmit} className="p-5 space-y-4">
              <p className="text-xs text-neutral-600 leading-relaxed">
                Log in with your Gmail address to access your private storage slot. Your saved work will be retained securely for exactly <strong className="text-amber-600 font-bold">1 day (24 hours)</strong> and then auto-deleted.
              </p>

              {/* Alert info banner */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[10.5px] text-amber-900 leading-relaxed space-y-1">
                <p className="font-bold flex items-center gap-1.5 text-amber-800 text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  Simple Credentials Rule:
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-neutral-600">
                  <li>Email must end with <code className="text-amber-800 text-[10px] bg-amber-100 px-1 py-0.5 rounded font-mono font-bold">@gmail.com</code></li>
                  <li>Password: <code className="text-amber-800 text-[10px] bg-amber-100 px-1 py-0.5 rounded font-mono font-bold">123456</code> or <code className="text-amber-800 text-[10px] bg-amber-100 px-1 py-0.5 rounded font-mono font-bold">password</code></li>
                </ul>
              </div>

              {authError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3 text-xs font-semibold">
                  ⚠️ {authError}
                </div>
              )}

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-neutral-500 font-black uppercase tracking-wider block">Gmail Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 w-4 h-4 text-neutral-400" />
                  <input
                    type="email"
                    required
                    placeholder="yourname@gmail.com"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full bg-neutral-50 border border-neutral-200 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl py-2 pl-9 pr-4 text-xs font-medium text-neutral-900 placeholder-neutral-400 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-neutral-500 font-black uppercase tracking-wider block">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 w-4 h-4 text-neutral-400" />
                  <input
                    type="password"
                    required
                    placeholder="••••••"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full bg-neutral-50 border border-neutral-200 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl py-2 pl-9 pr-4 text-xs font-medium text-neutral-900 placeholder-neutral-400 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                className="w-full py-2.5 mt-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-600 hover:to-amber-500 text-neutral-950 font-black text-xs text-center transition-all uppercase cursor-pointer shadow-sm shadow-amber-500/10"
              >
                Log In & Sync
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 🌟 Premium Real-time Notification HUD (Auto-dismisses after 2 seconds) */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => {
            const isSuccess = toast.type === 'success';
            const isError = toast.type === 'error';
            const isWarning = toast.type === 'warning';
            
            let bgClass = 'bg-neutral-950/95 border-neutral-800 text-neutral-300';
            let accentBar = 'bg-blue-500';
            let icon = <Info className="w-4 h-4 text-blue-400 shrink-0" />;
            let title = 'Notification';

            if (isSuccess) {
              bgClass = 'bg-neutral-950/95 border-emerald-500/20 text-neutral-200';
              accentBar = 'bg-emerald-500';
              icon = <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
              title = 'Success';
            } else if (isError) {
              bgClass = 'bg-neutral-950/95 border-rose-500/20 text-neutral-200';
              accentBar = 'bg-rose-500';
              icon = <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />;
              title = 'Error / Limit Blocked';
            } else if (isWarning) {
              bgClass = 'bg-neutral-950/95 border-amber-500/20 text-neutral-200';
              accentBar = 'bg-amber-500';
              icon = <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
              title = 'Rule / Warning';
            }

            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: -20, scale: 0.95, x: 20 }}
                animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.9, x: 20, transition: { duration: 0.15 } }}
                className={`pointer-events-auto flex gap-3 p-3.5 rounded-xl border shadow-2xl backdrop-blur-md ${bgClass}`}
              >
                {/* Accent bar */}
                <div className={`w-1 rounded-full shrink-0 ${accentBar}`} />
                
                {/* Content */}
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-1.5">
                    {icon}
                    <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">{title}</span>
                  </div>
                  <p className="text-xs font-semibold leading-relaxed text-neutral-100">{toast.message}</p>
                </div>

                {/* Dismiss button */}
                <button
                  onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                  className="self-start p-1 rounded-lg hover:bg-neutral-900 text-neutral-500 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      </div>
    </div>
  );
}
