import type { LogSearchResult } from "../../types";

interface LogSearchDialogProps {
  query: string;
  results: LogSearchResult[];
  onQueryChange: (value: string) => void;
  onClose: () => void;
  onOpenSession: (sessionId: string) => void;
}

export function LogSearchDialog({
  query,
  results,
  onQueryChange,
  onClose,
  onOpenSession,
}: LogSearchDialogProps) {
  return (
    <div className="fixed inset-0 bg-[#1a1a1a]/80 backdrop-blur-sm z-[100] flex items-start justify-center pt-[15vh] p-4 font-['Space_Grotesk']" role="presentation" onClick={onClose}>
      <section
        className="w-full max-w-2xl bg-[#f5f0e8] dark:bg-[#1a1a1a] border-8 border-[#1a1a1a] dark:border-[#f5f0e8] text-[#1a1a1a] dark:text-[#f5f0e8] flex flex-col shadow-[8px_8px_0px_0px_#1a1a1a] dark:shadow-[8px_8px_0px_0px_#f5f0e8]"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center border-b-4 border-[#1a1a1a] dark:border-[#f5f0e8] bg-white dark:bg-[#1a1a1a]">
          <span className="material-symbols-outlined text-[#1a1a1a] dark:text-[#f5f0e8] px-6 text-2xl font-bold">search</span>
          <input
            autoFocus
            className="w-full bg-transparent py-6 pr-6 outline-none font-['Space_Grotesk'] font-black text-2xl placeholder:opacity-30 dark:placeholder:opacity-50 text-[#1a1a1a] dark:text-[#f5f0e8]"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search terminal logs..."
          />
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-6 py-8 text-center text-[#1a1a1a] dark:text-[#f5f0e8] font-black text-lg opacity-50 uppercase">
              No matching lines in current session logs
            </div>
          ) : (
            <div className="flex flex-col">
              <div className="px-6 py-4 uppercase text-xs font-black tracking-widest opacity-50 bg-[#e8e3da] dark:bg-[#2a2a2a] border-b-4 border-[#1a1a1a] dark:border-[#f5f0e8] text-[#1a1a1a] dark:text-[#f5f0e8]">Matches</div>
              {results.map((result) => (
                <button
                  className="flex flex-col text-left px-6 py-4 border-b-2 border-[#1a1a1a] dark:border-[#f5f0e8] hover:bg-[#ffcc00] focus:bg-[#ffcc00] dark:hover:bg-[#ffcc00] dark:focus:bg-[#ffcc00] dark:hover:text-[#1a1a1a] dark:focus:text-[#1a1a1a] cursor-pointer outline-none transition-none group text-[#1a1a1a] dark:text-[#f5f0e8] w-full"
                  key={result.sessionId}
                  onClick={() => {
                    onOpenSession(result.sessionId);
                    onClose();
                  }}
                  type="button"
                >
                  <strong className="font-black text-lg uppercase group-hover:underline">{result.title}</strong>
                  <div className="font-mono text-xs opacity-70 mt-2 bg-black/5 dark:bg-white/5 p-2 border border-black/10 dark:border-white/10 overflow-hidden w-full group-hover:bg-white dark:group-hover:bg-[#f5f0e8] group-hover:opacity-100 transition-colors">
                    {result.matches.map((line, index) => (
                      <code className="block truncate" key={`${result.sessionId}-${index}`}>{line}</code>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        
        <div className="p-3 border-t-4 border-[#1a1a1a] dark:border-[#f5f0e8] bg-[#e8e3da] dark:bg-[#121212] flex gap-4 text-[10px] font-['Space_Grotesk'] font-bold uppercase tracking-widest opacity-60 text-[#1a1a1a] dark:text-[#f5f0e8]">
            <span className="flex items-center gap-1"><kbd className="border border-[#1a1a1a] dark:border-[#f5f0e8] px-1 pb-0.5 bg-white dark:bg-[#1a1a1a] font-sans text-[#1a1a1a] dark:text-[#f5f0e8]">↑↓</kbd> NAVIGATE</span>
            <span className="flex items-center gap-1"><kbd className="border border-[#1a1a1a] dark:border-[#f5f0e8] px-1 pb-0.5 bg-white dark:bg-[#1a1a1a] font-sans text-[#1a1a1a] dark:text-[#f5f0e8]">↵</kbd> SELECT</span>
            <span className="flex items-center gap-1"><kbd className="border border-[#1a1a1a] dark:border-[#f5f0e8] px-1 pb-0.5 bg-white dark:bg-[#1a1a1a] font-sans text-[#1a1a1a] dark:text-[#f5f0e8]">ESC</kbd> CLOSE</span>
        </div>
      </section>
    </div>
  );
}
