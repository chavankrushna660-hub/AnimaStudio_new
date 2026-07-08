import React, { useEffect, useState, useRef } from 'react';
import { Sparkles, Eye, Heart, HelpCircle, X, Tv, Gift, AlertCircle, Play, ThumbsUp, DollarSign, Award } from 'lucide-react';

// Global error suppressor to swallow cross-origin script error noise and Adsterra runtime warnings.
// This is essential to prevent sandbox context errors from bubbling up and crashing/interrupting the app.
if (typeof window !== 'undefined') {
  const handleAdError = (msg: string, url: string) => {
    const msgLower = String(msg).toLowerCase();
    const urlLower = String(url).toLowerCase();
    return (
      msgLower.includes('script error') ||
      msgLower.includes('adsterra') ||
      msgLower.includes('effectivecpmnetwork') ||
      msgLower.includes('highperformanceformat') ||
      urlLower.includes('effectivecpmnetwork') ||
      urlLower.includes('highperformanceformat') ||
      urlLower.includes('invoke.js') ||
      urlLower.includes('cpmnetwork')
    );
  };

  const originalOnError = window.onerror;
  window.onerror = function (message, source, lineno, colno, error) {
    if (handleAdError(String(message), String(source || ''))) {
      // Return true to prevent standard browser error-bubble/crash handling
      return true;
    }
    if (originalOnError) {
      return originalOnError.apply(this, arguments as any);
    }
    return false;
  };

  window.addEventListener('error', (event) => {
    if (handleAdError(event.message, event.filename)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    const reasonStr = event.reason ? String(event.reason) : '';
    if (handleAdError(reasonStr, '')) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
}

// Ad formats and keys from user's Adsterra screenshots
export const AD_KEYS = {
  popunder: {
    src: 'https://pl30260080.effectivecpmnetwork.com/74/bc/70/74bc70c96615cc0a005afdd6799a80d3.js'
  },
  nativeBanner: {
    id: 'container-7cc5b295556eed97425e67e9310ebbe5',
    src: 'https://pl30260080.effectivecpmnetwork.com/7cc5b295556eed97425e67e9310ebbe5/invoke.js'
  },
  banner468x60: {
    key: '2c071476b062c2c73142227b89e90ff4',
    width: 468,
    height: 60
  },
  banner160x300: {
    key: '89667e1255bca5c9ffda9bcfc4dfd7cd',
    width: 160,
    height: 300
  }
};

interface AdComponentProps {
  darkTheme?: boolean;
}

/**
 * Hook to inject external script tags safely
 */
function useExternalScript(src: string, id?: string) {
  useEffect(() => {
    if (!src) return;
    
    // Check if script already exists
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) return;

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.setAttribute('data-cfasync', 'false');
    if (id) {
      script.id = `ad-script-${id}`;
    }

    document.body.appendChild(script);

    return () => {
      // Clean up if component unmounts quickly
      // Note: Ad scripts might modify DOM, so we keep cleanup conservative
    };
  }, [src, id]);
}

/**
 * 1. POPUNDER AD TRIGGER
 * Deactivated to protect canvas and tool buttons from being hijacked by background click tracking.
 * This guarantees that only direct clicks on the ad banners at the top or bottom will trigger any redirects.
 */
export function PopunderAdTrigger() {
  // Deactivated globally to prevent automatic background redirects on tools and features.
  return null; 
}

/**
 * 2. NATIVE BANNER AD (container-7cc5b295556eed97425e67e9310ebbe5)
 * Dynamically renders the native ad widget container.
 * Falling back to a beautiful dark simulated ad if blocked or fails to load.
 * Refreshes automatically every 60 seconds by force-remounting the inner component.
 */
export function NativeBannerAd() {
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey(prev => prev + 1);
    }, 60000); // 60 seconds
    return () => clearInterval(interval);
  }, []);

  return <NativeBannerAdInner key={refreshKey} />;
}

function NativeBannerAdInner() {
  const [isBlocked, setIsBlocked] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const containerId = AD_KEYS.nativeBanner.id;
    const scriptSrc = AD_KEYS.nativeBanner.src;

    setIsBlocked(false);

    // Timer to detect if the script failed to render anything within 3 seconds (likely adblocker)
    const timer = setTimeout(() => {
      if (containerRef.current && containerRef.current.children.length === 0) {
        setIsBlocked(true);
      }
    }, 2800);

    // Dynamic Injection
    try {
      const script = document.createElement('script');
      script.src = scriptSrc;
      script.async = true;
      script.setAttribute('data-cfasync', 'false');
      
      if (containerRef.current) {
        containerRef.current.appendChild(script);
      }
    } catch (err) {
      setIsBlocked(true);
    }

    return () => {
      clearTimeout(timer);
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, []);

  return (
    <div className="w-full min-h-[70px] flex flex-col items-center justify-center bg-black rounded-lg overflow-hidden border border-neutral-900">
      {/* Real Adsterra Target Container */}
      {!isBlocked && (
        <div 
          ref={containerRef} 
          id={AD_KEYS.nativeBanner.id} 
          className="w-full text-center"
        />
      )}

      {/* High Polish Dark-themed Fallback / Simulator if blocked or loading */}
      {isBlocked && (
        <div className="w-full p-3 bg-neutral-950 flex flex-col sm:flex-row items-center justify-between gap-3 text-left animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/20">
              <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] bg-amber-500/20 text-amber-400 font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider">
                  Ad / Sponsor
                </span>
                <h4 className="text-xs font-bold text-neutral-200">AnimaStudio Pro Preset Engine</h4>
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Get 500+ pre-rigged vector characters, skeletal templates & physics presets instantly.
              </p>
            </div>
          </div>
          <button 
            onClick={() => window.open('https://ai.studio/build', '_blank')}
            className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-[10.5px] tracking-wider uppercase transition-all shadow-md shrink-0 cursor-pointer"
          >
            Explore Preset Vault
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * 3. STANDARD BANNER AD (468x60 or general size options)
 * Implements the iframe-based ad format of Adsterra dynamically.
 * Falls back to high-fidelity simulated ads when blocked or loading.
 * Refreshes automatically every 60 seconds by force-remounting the inner component.
 */
export function StandardBannerAd({ format = '468x60' }: { format: '468x60' | '160x300' }) {
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey(prev => prev + 1);
    }, 60000); // 60 seconds
    return () => clearInterval(interval);
  }, []);

  return <StandardBannerAdInner key={refreshKey} format={format} />;
}

interface StandardBannerAdInnerProps {
  format: '468x60' | '160x300';
  key?: React.Key;
}

function StandardBannerAdInner({ format }: StandardBannerAdInnerProps) {
  const [isBlocked, setIsBlocked] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const is468 = format === '468x60';
  const width = is468 ? AD_KEYS.banner468x60.width : AD_KEYS.banner160x300.width;
  const height = is468 ? AD_KEYS.banner468x60.height : AD_KEYS.banner160x300.height;
  const adKey = is468 ? AD_KEYS.banner468x60.key : AD_KEYS.banner160x300.key;

  useEffect(() => {
    const scriptId = `adsterra-banner-${adKey}-${Math.random()}`;
    setIsBlocked(false);

    // Timer to detect adblocker (if container is empty after 2.5 seconds)
    const timer = setTimeout(() => {
      if (containerRef.current && containerRef.current.innerHTML === '') {
        setIsBlocked(true);
      }
    }, 2500);

    try {
      // Adsterra parameters setup
      (window as any).atOptions = {
        key: adKey,
        format: 'iframe',
        height: height,
        width: width,
        params: {}
      };

      const script = document.createElement('script');
      script.id = scriptId;
      script.src = `//www.highperformanceformat.com/${adKey}/invoke.js`;
      script.async = true;

      if (containerRef.current) {
        containerRef.current.appendChild(script);
      }
    } catch (e) {
      setIsBlocked(true);
    }

    return () => {
      clearTimeout(timer);
      const script = document.getElementById(scriptId);
      if (script) script.remove();
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [adKey, height, width]);

  return (
    <div 
      className="flex items-center justify-center bg-black border border-neutral-900 rounded-lg overflow-hidden transition-all duration-300 relative"
      style={{ width: `${width}px`, height: `${height}px` }}
    >
      {/* Real Script Target */}
      {!isBlocked && (
        <div ref={containerRef} className="w-full h-full flex items-center justify-center text-center" />
      )}

      {/* Simulated Developer Sponsor Fallback (Guaranteed to render & perfectly non-obtrusive) */}
      {isBlocked && (
        <div className="w-full h-full flex flex-col items-center justify-center p-2.5 text-center relative select-none bg-neutral-950 animate-fade-in">
          {/* Ad Label */}
          <span className="absolute top-1 right-1 text-[8px] bg-neutral-800 text-neutral-500 px-1 rounded uppercase tracking-widest font-black">
            Sponsor
          </span>

          {is468 ? (
            <div className="flex items-center gap-3 w-full h-full justify-between px-3 text-left animate-fade-in">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-gradient-to-tr from-amber-500 to-yellow-400 flex items-center justify-center shadow">
                  <Tv className="w-4 h-4 text-neutral-950" />
                </div>
                <div>
                  <h5 className="text-[11px] font-black uppercase text-amber-400 leading-none">AnimaStudio Cloud Render</h5>
                  <p className="text-[9px] text-neutral-400 mt-0.5 leading-tight">Export 4K vectors & movies at 120fps with zero lag.</p>
                </div>
              </div>
              <button 
                onClick={() => window.open('https://ai.studio/build', '_blank')}
                className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-[9px] uppercase transition cursor-pointer"
              >
                Boost Speed
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-between h-full w-full py-1 animate-fade-in">
              <div className="w-10 h-10 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center mt-1">
                <Gift className="w-5 h-5 text-amber-500 animate-bounce" />
              </div>
              <div className="space-y-1">
                <h5 className="text-[10px] font-extrabold uppercase text-amber-400 tracking-wider">Premium Assets</h5>
                <p className="text-[9px] text-neutral-400 leading-snug px-1">
                  Unlock 2,000+ interactive smart rigging templates.
                </p>
              </div>
              <button 
                onClick={() => window.open('https://ai.studio/build', '_blank')}
                className="w-full py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-[9px] uppercase tracking-wider transition-all cursor-pointer"
              >
                Claim Pack
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 4. SYSTEM-WIDE BOTTOM BAR FOR ADS (Solid black bar keeping main features 100% clean)
 * Placed at the very bottom of the screen, separate from canvas/tools/features.
 */
export function BottomAdBar({ onOpenTheater }: { onOpenTheater: () => void }) {
  // Use Popunder trigger in app
  return (
    <div 
      id="system-bottom-ad-bar"
      className="h-[90px] bg-black border-t border-neutral-900 px-4 flex items-center justify-between gap-4 select-none shrink-0 overflow-hidden relative z-10"
    >
      <PopunderAdTrigger />

      {/* Left side ad slot: Compact Adsterra Native Ad or Simulator */}
      <div className="hidden lg:flex items-center gap-2 max-w-[280px] shrink-0 border border-neutral-900 bg-neutral-950 p-1.5 rounded-lg">
        <div className="flex flex-col">
          <span className="text-[7.5px] bg-neutral-800 text-neutral-400 w-max px-1 rounded uppercase tracking-wider font-extrabold mb-1">
            Sponsor Left
          </span>
          <p className="text-[9.5px] text-neutral-400 font-bold leading-tight truncate">AnimaStudio Cloud Sync</p>
          <p className="text-[8px] text-neutral-500 leading-none mt-0.5">Automated workspace backup.</p>
        </div>
        <button 
          onClick={() => window.open('https://ai.studio/build', '_blank')}
          className="text-[8.5px] font-black uppercase text-amber-400 border border-amber-500/20 hover:bg-amber-500/10 px-1.5 py-1 rounded cursor-pointer"
        >
          Sync
        </button>
      </div>

      {/* Different Ad Type: Adsterra Native Banner center-aligned (Highly responsive, auto-refreshes every 1m) */}
      <div className="flex-1 max-w-[500px] flex items-center justify-center shrink-0">
        <NativeBannerAd />
      </div>

      {/* Right side ad slot: Compact Adsterra Native Ad or Simulator + Theater Button */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="hidden md:flex items-center gap-2 max-w-[240px] border border-neutral-900 bg-neutral-950 p-1.5 rounded-lg">
          <div className="flex flex-col text-right">
            <span className="text-[7.5px] bg-neutral-800 text-neutral-400 w-max px-1 rounded uppercase tracking-wider font-extrabold mb-1 ml-auto">
              Sponsor Right
            </span>
            <p className="text-[9.5px] text-neutral-400 font-bold leading-tight">Rigging Preset Tool</p>
            <p className="text-[8px] text-neutral-500 leading-none mt-0.5">Import standard rigs instantly.</p>
          </div>
          <button 
            onClick={() => window.open('https://ai.studio/build', '_blank')}
            className="text-[8.5px] font-black uppercase text-amber-400 border border-amber-500/20 hover:bg-amber-500/10 px-1.5 py-1 rounded cursor-pointer"
          >
            Load
          </button>
        </div>

        <button
          onClick={onOpenTheater}
          className="flex items-center gap-1 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wide transition-all shadow-md shrink-0 cursor-pointer animate-pulse"
          title="Open Theater Ad Break to support app development"
        >
          🎬 <span className="hidden sm:inline">Ad Theater</span>
        </button>
      </div>
    </div>
  );
}

/**
 * 4.1 SYSTEM-WIDE TOP BAR FOR ADS (Solid black bar at the top of the viewport)
 * Placed at the very top of the screen, completely separate from editing features.
 */
export function TopAdBar() {
  return (
    <div 
      id="system-top-ad-bar"
      className="h-[70px] bg-black border-b border-neutral-900 px-4 flex items-center justify-between gap-4 select-none shrink-0 overflow-hidden relative z-10"
    >
      {/* Left side Sponsorship Branding */}
      <div className="hidden md:flex flex-col justify-center items-start text-left max-w-[240px] shrink-0">
        <div className="flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-amber-400 fill-current" />
          <span className="text-[9px] font-black uppercase tracking-wider text-amber-400">
            Premium Sponsors
          </span>
        </div>
        <p className="text-[8.5px] text-neutral-500 font-bold leading-normal mt-0.5 uppercase tracking-wide">
          Safe Workspace Guaranteed
        </p>
      </div>

      {/* Center: Top Banner Adsterra 468x60 */}
      <div className="mx-auto flex items-center justify-center shrink-0">
        <StandardBannerAd format="468x60" />
      </div>

      {/* Right side ad partner widget */}
      <div className="hidden sm:flex items-center gap-2.5 shrink-0">
        <div className="text-right">
          <span className="text-[7.5px] bg-neutral-850 text-neutral-500 px-1 py-0.5 rounded uppercase font-black tracking-widest block w-max ml-auto mb-1">
            Ad Partner
          </span>
          <span className="text-[9px] text-neutral-400 font-extrabold uppercase tracking-wider block">No Canvas Interruption</span>
        </div>
      </div>
    </div>
  );
}

/**
 * 5. AD THEATER MODAL (Beautiful full solid-black theater-themed screen)
 * Designed strictly as a separate black screen that contains ad formats beautifully.
 * This completely isolates ads, guarantees high revenue potential, and avoids animator frustration.
 */
interface AdTheaterProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdTheaterModal({ isOpen, onClose }: AdTheaterProps) {
  const [countdown, setCountdown] = useState(15);
  const [canSkip, setCanSkip] = useState(false);
  const [supportPoints, setSupportPoints] = useState(0);
  const [theaterMode, setTheaterMode] = useState<'normal' | 'cinematic'>('normal');

  useEffect(() => {
    if (!isOpen) return;
    setCountdown(15);
    setCanSkip(false);

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setCanSkip(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div 
      id="ad-theater-modal" 
      className="fixed inset-0 z-50 bg-black flex flex-col justify-between overflow-hidden animate-fade-in select-none text-white font-sans"
    >
      {/* Cinematic dim background overlay */}
      <div className="absolute inset-0 bg-radial-gradient from-neutral-950 to-black opacity-95 pointer-events-none" />

      {/* HEADER BAR */}
      <header className="relative z-10 h-14 bg-neutral-950 border-b border-neutral-900 px-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center shadow shadow-amber-500/20">
            <Tv className="w-4 h-4 text-neutral-950" />
          </div>
          <div>
            <h3 className="font-black uppercase tracking-wider text-xs text-neutral-100 flex items-center gap-1.5">
              AnimaStudio Ad Theater
              <span className="text-[8px] bg-amber-500/20 text-amber-400 font-extrabold px-1.5 py-0.5 rounded">
                LIVE SPONSORSHIPS
              </span>
            </h3>
            <p className="text-[9px] text-neutral-500 font-bold uppercase tracking-widest mt-0.5">
              Watching supports independent creators and development
            </p>
          </div>
        </div>

        {/* Countdown & skip controls */}
        <div className="flex items-center gap-2.5">
          {canSkip ? (
            <button
              onClick={onClose}
              className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black px-4.5 py-2 rounded-xl text-xs uppercase tracking-wider transition cursor-pointer"
            >
              Skip Ad Break <X className="w-4 h-4" />
            </button>
          ) : (
            <div className="bg-neutral-900/90 border border-neutral-800 px-3.5 py-2 rounded-xl text-xs font-black text-amber-400 flex items-center gap-1.5 uppercase font-mono">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              Skip in {countdown}s
            </div>
          )}
        </div>
      </header>

      {/* CENTRAL THEATER VIEWPORT (Black screen with ad panels) */}
      <main className="relative z-10 flex-1 flex flex-col md:flex-row items-center justify-center p-4 md:p-8 gap-6 max-w-6xl mx-auto w-full">
        
        {/* Left column: Vertical ad billboard */}
        <div className="hidden md:flex flex-col items-center justify-center space-y-2 shrink-0 animate-fade-in-left">
          <span className="text-[8px] text-neutral-500 uppercase tracking-widest font-black">
            Billboard Left
          </span>
          <StandardBannerAd format="160x300" />
        </div>

        {/* Center Screen: Interactive monetization sandbox */}
        <div className="flex-1 w-full bg-neutral-950 rounded-2xl border border-neutral-900 overflow-hidden flex flex-col shadow-2xl relative">
          
          {/* Main Simulated Screen */}
          <div className="flex-1 min-h-[250px] p-6 flex flex-col items-center justify-center text-center bg-black border-b border-neutral-900 relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.03)_0%,transparent_70%)] pointer-events-none" />

            {/* Play Button Simulated Loader */}
            <div className="space-y-4">
              <div className="w-16 h-16 rounded-full bg-neutral-950 border border-neutral-850 flex items-center justify-center mx-auto hover:scale-105 active:scale-95 transition-all duration-300 group shadow-lg">
                <Play className="w-7 h-7 text-amber-400 fill-current animate-pulse group-hover:text-amber-300" />
              </div>

              <div className="space-y-1 max-w-sm mx-auto">
                <h4 className="text-sm font-black uppercase text-amber-400 tracking-wider">
                  Interactive Support Stream
                </h4>
                <p className="text-xs text-neutral-400 leading-relaxed font-medium">
                  Clicking the ads below generates revenue directly for this project, keeping all professional animation tools completely free!
                </p>
              </div>

              {/* Supporter counters */}
              <div className="flex items-center justify-center gap-6 pt-3 border-t border-neutral-900">
                <div className="text-center">
                  <span className="text-xs text-neutral-500 font-extrabold uppercase tracking-wider block">Your Support</span>
                  <span className="text-sm font-black text-amber-400 font-mono">+{supportPoints} Points</span>
                </div>
                <div className="w-[1px] h-8 bg-neutral-900" />
                <div className="text-center">
                  <span className="text-xs text-neutral-500 font-extrabold uppercase tracking-wider block">Theater Mode</span>
                  <button 
                    onClick={() => {
                      setSupportPoints(prev => prev + 10);
                      setTheaterMode(prev => prev === 'normal' ? 'cinematic' : 'normal');
                    }}
                    className="text-xs font-black text-neutral-300 hover:text-white uppercase underline cursor-pointer"
                  >
                    {theaterMode === 'normal' ? 'Cinematic Mode' : 'Default Mode'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Native ad integration */}
          <div className="p-4 bg-neutral-950 flex flex-col items-center justify-center">
            <span className="text-[8px] text-neutral-500 uppercase tracking-widest font-black mb-2">
              Sponsored Native Bar
            </span>
            <NativeBannerAd />
          </div>

        </div>

        {/* Right column: Vertical ad billboard */}
        <div className="hidden md:flex flex-col items-center justify-center space-y-2 shrink-0 animate-fade-in-right">
          <span className="text-[8px] text-neutral-500 uppercase tracking-widest font-black">
            Billboard Right
          </span>
          <StandardBannerAd format="160x300" />
        </div>

      </main>

      {/* THEATER FOOTER SEATS */}
      <footer className="relative z-10 bg-neutral-950 border-t border-neutral-900 py-3.5 px-6 flex flex-col sm:flex-row items-center justify-between text-xs text-neutral-500 font-medium">
        <div className="flex items-center gap-1.5">
          <Award className="w-4 h-4 text-amber-500" />
          <span>Proudly supported by Chavankrushna. Thank you for making amazing animation art!</span>
        </div>
        <div className="flex items-center gap-4 mt-2 sm:mt-0 text-[10.5px]">
          <button 
            onClick={() => setSupportPoints(p => p + 50)}
            className="text-amber-500 hover:text-amber-400 font-extrabold flex items-center gap-1 transition uppercase cursor-pointer"
          >
            <Heart className="w-3.5 h-3.5 fill-current" /> Like Creator
          </button>
          <span>•</span>
          <span>Adsterra Integration Active v1.0.0</span>
        </div>
      </footer>
    </div>
  );
}
