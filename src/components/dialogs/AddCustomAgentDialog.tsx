import { useState } from "react";
import { nanoid } from "nanoid";
import { PROJECT_SWATCHES } from "../../constants/agents";
import type { AgentConfig } from "../../types";

interface AddCustomAgentDialogProps {
  onClose: () => void;
  onSubmit: (agent: AgentConfig) => void;
}

export function AddCustomAgentDialog({
  onClose,
  onSubmit,
}: AddCustomAgentDialogProps) {
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [cwdOverride, setCwdOverride] = useState("");
  const [envText, setEnvText] = useState("");
  const [color, setColor] = useState(PROJECT_SWATCHES[0]);

  const parseEnv = () =>
    envText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .reduce<Record<string, string>>((acc, line) => {
        const [key, ...rest] = line.split("=");
        if (!key || rest.length === 0) {
          return acc;
        }
        acc[key.trim()] = rest.join("=").trim();
        return acc;
      }, {});

  return (
    <div className="fixed inset-0 bg-[#1a1a1a]/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 font-['Space_Grotesk']" role="presentation" onClick={onClose}>
      <section
        className="w-full max-w-4xl bg-[#f5f0e8] dark:bg-[#1a1a1a] border-8 border-[#1a1a1a] dark:border-[#f5f0e8] flex flex-col shadow-[8px_8px_0px_0px_#1a1a1a] dark:shadow-[8px_8px_0px_0px_#f5f0e8] max-h-screen overflow-hidden text-[#1a1a1a] dark:text-[#f5f0e8]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-agent-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="bg-[#1a1a1a] dark:bg-[#f5f0e8] text-white dark:text-[#1a1a1a] p-4 flex justify-between items-center z-10 shrink-0">
          <h2 id="custom-agent-title" className="font-['Space_Grotesk'] font-bold uppercase text-2xl tracking-tighter">Add Agent</h2>
          <button className="material-symbols-outlined hover:text-[#e63b2e]" onClick={onClose} type="button">
            close
          </button>
        </div>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-repeat">
          
          <div className="md:w-1/3 border-r-8 border-[#1a1a1a] dark:border-[#f5f0e8] hidden md:flex flex-col relative overflow-hidden bg-[#e8e3da] dark:bg-[#2a2a2a]">
            <img src="/assets/hardware_terminal.jpg" alt="Terminal hardware" className="absolute inset-0 w-full h-full object-cover mix-blend-luminosity opacity-80" />
            <div className="absolute inset-0 bg-[#0055ff]/20 mix-blend-multiply"></div>
            <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-[#1a1a1a] to-transparent text-white pt-20">
              <h3 className="font-black text-xl mb-2">MANUAL CONFIG</h3>
              <p className="font-body text-xs opacity-80 mb-4">Define a custom execution profile for an agent not found on PATH.</p>
            </div>
            <div className="absolute top-4 left-4 bg-[#ffcc00] text-[#1a1a1a] border-2 border-[#1a1a1a] dark:border-[#f5f0e8] px-2 py-1 text-xs font-black">
              ADVANCED
            </div>
          </div>

          <div className="flex-1 p-8 overflow-y-auto bg-[#f5f0e8] dark:bg-[#1a1a1a] flex flex-col gap-6 shadow-inner">
            
            <div className="flex flex-col gap-2">
              <label className="uppercase font-black text-sm tracking-wider">Display Name</label>
              <input
                className="w-full bg-white dark:bg-[#1a1a1a] border-4 border-[#1a1a1a] dark:border-[#f5f0e8] text-[#1a1a1a] dark:text-[#f5f0e8] p-3 font-body font-bold text-base outline-none focus:border-[#0055ff] transition-colors"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. My Custom Agent"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="uppercase font-black text-sm tracking-wider">Executable Command</label>
              <input
                className="w-full bg-white dark:bg-[#1a1a1a] border-4 border-[#1a1a1a] dark:border-[#f5f0e8] text-[#1a1a1a] dark:text-[#f5f0e8] p-3 font-mono text-base outline-none focus:border-[#0055ff] transition-colors"
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                placeholder="e.g. mcp-server"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="uppercase font-black text-sm tracking-wider">Arguments (Space-separated)</label>
              <input
                className="w-full bg-white dark:bg-[#1a1a1a] border-4 border-[#1a1a1a] dark:border-[#f5f0e8] text-[#1a1a1a] dark:text-[#f5f0e8] p-3 font-mono text-base outline-none focus:border-[#0055ff] transition-colors"
                value={args}
                onChange={(event) => setArgs(event.target.value)}
                placeholder="e.g. --port 3000 --verbose"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="uppercase font-black text-sm tracking-wider flex justify-between">
                <span>Working Directory Override</span>
                <span className="opacity-50 font-normal">Optional</span>
              </label>
              <input
                className="w-full bg-white dark:bg-[#1a1a1a] border-4 border-[#1a1a1a] dark:border-[#f5f0e8] text-[#1a1a1a] dark:text-[#f5f0e8] p-3 font-mono text-base outline-none focus:border-[#0055ff] transition-colors"
                value={cwdOverride}
                onChange={(event) => setCwdOverride(event.target.value)}
                placeholder="/absolute/path/override"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="uppercase font-black text-sm tracking-wider flex justify-between">
                <span>Environment Variables</span>
                <span className="opacity-50 font-normal">KEY=VALUE</span>
              </label>
              <textarea
                className="w-full bg-[#1a1a1a] text-[#00ff00] border-4 border-[#0055ff] p-3 font-mono text-xs outline-none min-h-[100px] resize-y placeholder:text-[#00ff00]/30"
                value={envText}
                onChange={(event) => setEnvText(event.target.value)}
                placeholder="API_KEY=sk-...\nDEBUG=true"
              />
            </div>

            <div className="flex flex-col gap-2 text-[#1a1a1a] dark:text-[#f5f0e8]">
              <label className="uppercase font-black text-sm tracking-wider">Accent Color</label>
              <div className="flex gap-4 flex-wrap">
                {PROJECT_SWATCHES.map((swatch) => {
                  const selected = color === swatch;
                  return (
                    <button
                      key={swatch}
                      className={`w-10 h-10 border-4 transition-all ${
                        selected 
                          ? "border-[#1a1a1a] dark:border-[#f5f0e8] shadow-[4px_4px_0px_0px_#1a1a1a] dark:shadow-[4px_4px_0px_0px_#f5f0e8] scale-110 translate-y-[-4px]" 
                          : "border-transparent hover:border-black/30 dark:hover:border-white/30"
                      }`}
                      onClick={() => setColor(swatch)}
                      style={{ background: swatch }}
                      type="button"
                      title={`Select color ${swatch}`}
                    />
                  );
                })}
              </div>
            </div>

          </div>
        </div>

        <div className="p-4 border-t-8 border-[#1a1a1a] dark:border-[#f5f0e8] bg-white dark:bg-[#1a1a1a] flex justify-between items-center z-10 shrink-0">
          <div className="text-xs font-bold text-[#e63b2e] opacity-80 w-1/2">
            {!name.trim() || !command.trim() ? "NAME AND COMMAND REQUIRED" : ""}
          </div>
          <div className="flex justify-end gap-4">
            <button 
              className="px-6 py-3 font-black uppercase tracking-widest border-4 border-transparent hover:border-[#1a1a1a] dark:hover:border-[#f5f0e8] hover:bg-[#f5f0e8] dark:hover:bg-[#121212] transition-all text-[#1a1a1a] dark:text-[#f5f0e8]"
              onClick={onClose} 
              type="button"
            >
              Cancel
            </button>
            <button
              className="bg-[#0055ff] text-white border-4 border-[#1a1a1a] dark:border-[#f5f0e8] px-8 py-3 font-black uppercase shadow-[4px_4px_0px_0px_#1a1a1a] dark:shadow-[4px_4px_0px_0px_#f5f0e8] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!name.trim() || !command.trim()}
              onClick={() => {
                onSubmit({
                  id: `custom-${nanoid(8)}`,
                  name: name.trim(),
                  command: command.trim(),
                  args: args.trim() ? args.trim().split(/\s+/) : [],
                  cwdOverride: cwdOverride.trim() || undefined,
                  env: parseEnv(),
                  color,
                  statusColor: color,
                });
              }}
              type="button"
            >
              Save Agent
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
