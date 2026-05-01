import { useEffect, useState } from "react";
import { isTauri } from "../../lib/api";
import { useSessionStore } from "../../store/sessionStore";

interface TitlebarProps {
  sidebarCollapsed: boolean;
}

export function Titlebar({ sidebarCollapsed }: TitlebarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [appWindow, setAppWindow] = useState<ReturnType<typeof import("@tauri-apps/api/window").getCurrentWindow> | null>(null);
  const runtimeInfo = useSessionStore((state) => state.runtimeInfo);
  const isMac = runtimeInfo?.os === "macos";

  useEffect(() => {
    if (!isTauri()) return;
    let mounted = true;

    const init = async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      if (!mounted) return;
      setAppWindow(win);

      const syncMaximized = async () => {
        const maximized = await win.isMaximized();
        if (mounted) {
          setIsMaximized(maximized);
        }
      };

      void syncMaximized();

      const unlistenPromise = win.onResized(() => {
        void syncMaximized();
      });

      return () => {
        mounted = false;
        void unlistenPromise.then((unlisten) => unlisten());
      };
    };

    const cleanupPromise = init();
    return () => {
      void cleanupPromise.then((cleanup) => cleanup?.());
    };
  }, []);

  const handleClose = () => {
    if (appWindow) void appWindow.close();
  };
  const handleMinimize = () => {
    if (appWindow) void appWindow.minimize();
  };
  const handleToggleMaximize = () => {
    if (appWindow) void appWindow.toggleMaximize();
  };

  return (
    <header
      className={`bg-[#f5f0e8] dark:bg-[#1a1a1a] border-b-4 border-[#1a1a1a] dark:border-[#f5f0e8] flex justify-between items-center w-full z-50 shadow-[4px_4px_0px_0px_#1a1a1a] dark:shadow-[4px_4px_0px_0px_#f5f0e8] fixed top-0 left-0 transition-all duration-200 ${sidebarCollapsed ? "h-10 px-3" : "h-16 px-6"}`}
      data-tauri-drag-region
    >
      <div className="flex items-center gap-4 h-full" data-tauri-drag-region>
        {sidebarCollapsed ? (
          <span className="material-symbols-outlined text-xl text-[#1a1a1a] dark:text-[#f5f0e8]">
            terminal
          </span>
        ) : (
          <div className="text-2xl font-['Space_Grotesk'] uppercase tracking-tighter font-black text-[#1a1a1a] dark:text-[#f5f0e8] border-2 border-[#1a1a1a] dark:border-[#f5f0e8] px-2 h-8 flex items-center shrink-0">
            NEXUS_TERMINAL
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {isTauri() && isMac && (
          <div className="flex gap-2 mr-4 group">
            <span className="w-3 h-3 rounded-full bg-[#e63b2e] border border-[#1a1a1a] cursor-pointer hover:brightness-110" onClick={handleClose}></span>
            <span className="w-3 h-3 rounded-full bg-[#ffcc00] border border-[#1a1a1a] cursor-pointer hover:brightness-110" onClick={handleMinimize}></span>
            <span className="w-3 h-3 rounded-full bg-[#00ff00] border border-[#1a1a1a] cursor-pointer hover:brightness-110" onClick={handleToggleMaximize}></span>
          </div>
        )}
        {isTauri() && !isMac && (
          <>
            <span className="material-symbols-outlined cursor-pointer rounded-none hover:bg-[#ffcc00] p-1 border-2 border-transparent hover:border-[#1a1a1a] text-[#1a1a1a] dark:text-[#f5f0e8] dark:hover:text-[#1a1a1a]" onClick={handleMinimize}>minimize</span>
            <span className="material-symbols-outlined cursor-pointer rounded-none hover:bg-[#ffcc00] p-1 border-2 border-transparent hover:border-[#1a1a1a] text-[#1a1a1a] dark:text-[#f5f0e8] dark:hover:text-[#1a1a1a]" onClick={handleToggleMaximize}>{isMaximized ? "restore_page" : "maximize"}</span>
            <span className="material-symbols-outlined cursor-pointer rounded-none hover:bg-[#e63b2e] hover:text-white p-1 border-2 border-transparent hover:border-[#1a1a1a] text-[#1a1a1a] dark:text-[#f5f0e8] dark:hover:text-white" onClick={handleClose}>close</span>
          </>
        )}
      </div>
    </header>
  );
}