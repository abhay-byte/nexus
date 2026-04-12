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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 md:p-8 font-['Space_Grotesk']" role="presentation" onClick={onClose}>
      <section
        className="w-full max-w-5xl bg-[#e8e3da] flex flex-col overflow-hidden shadow-2xl"
        style={{ padding: '16px', gap: '16px' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-agent-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex justify-between items-center text-[#1a1a1a] px-2 shrink-0">
          <h2 id="custom-agent-title" className="font-['Space_Grotesk'] font-black uppercase text-xl md:text-2xl tracking-tighter">Add Agent</h2>
          <button className="material-symbols-outlined hover:text-[#e63b2e] text-2xl" onClick={onClose} type="button">
            close
          </button>
        </div>

        <div className="flex-1 flex flex-col md:flex-row min-h-0" style={{ gap: '16px' }}>
          
          <div className="md:w-[30%] bg-[#1a1a1c] hidden md:flex flex-col relative overflow-hidden" style={{ minHeight: '400px' }}>
            <div className="p-4 text-xs font-mono text-[#555] opacity-80">Terminal hardware</div>
            <div className="absolute top-[46px] left-[20px] bg-[#fbbf24] text-[#1a1a1a] border-2 border-[#fbbf24] px-2 py-1 text-[10px] font-black z-10 shadow-sm">
              ADVANCED
            </div>
            
            <div className="flex-1 flex items-center justify-center">
              <div className="border border-[#444] text-[#666] w-5 h-5 flex items-center justify-center text-xs font-mono">?</div>
            </div>
            
            <div className="p-6 bg-transparent text-white mt-auto">
              <h3 className="font-black text-lg mb-1 tracking-wide">MANUAL CONFIG</h3>
              <p className="font-body text-[11px] text-[#aaa] leading-relaxed mb-2">Define a custom execution profile for an agent not found on PATH.</p>
            </div>
          </div>

          <div className="flex-1 p-6 md:p-8 text-[#f5f0e8] overflow-y-auto bg-[#1a1a1c] flex flex-col gap-5 shadow-inner">
            
            <div className="flex flex-col gap-2">
              <label className="uppercase font-bold text-[11px] tracking-wider text-[#e8e3da]">Display Name</label>
              <input
                className="w-full bg-[#111] border-2 border-[#e8e3da] text-[#f5f0e8] p-3 font-body font-bold text-sm outline-none focus:border-[#0055ff] transition-colors placeholder:text-[#888] placeholder:font-normal"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. My Custom Agent"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="uppercase font-bold text-[11px] tracking-wider text-[#e8e3da]">Executable Command</label>
              <input
                className="w-full bg-[#111] border-2 border-[#e8e3da] text-[#f5f0e8] p-3 font-mono text-sm outline-none focus:border-[#0055ff] transition-colors placeholder:text-[#888]"
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                placeholder="e.g. mcp-server"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="uppercase font-bold text-[11px] tracking-wider text-[#e8e3da]">Arguments (Space-separated)</label>
              <input
                className="w-full bg-[#111] border-2 border-[#e8e3da] text-[#f5f0e8] p-3 font-mono text-sm outline-none focus:border-[#0055ff] transition-colors placeholder:text-[#888]"
                value={args}
                onChange={(event) => setArgs(event.target.value)}
                placeholder="e.g. --port 3000 --verbose"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="uppercase font-bold text-[11px] tracking-wider flex justify-between text-[#e8e3da]">
                <span>Working Directory Override</span>
                <span className="opacity-50 font-normal">OPTIONAL</span>
              </label>
              <input
                className="w-full bg-[#111] border-2 border-[#e8e3da] text-[#f5f0e8] p-3 font-mono text-sm outline-none focus:border-[#0055ff] transition-colors placeholder:text-[#888]"
                value={cwdOverride}
                onChange={(event) => setCwdOverride(event.target.value)}
                placeholder="/absolute/path/override"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="uppercase font-bold text-[11px] tracking-wider flex justify-between text-[#e8e3da]">
                <span>Environment Variables</span>
                <span className="opacity-50 font-normal">KEY=VALUE</span>
              </label>
              <textarea
                className="w-full bg-[#111] border-2 border-[#0055ff] text-[#22c55e] p-3 font-mono text-sm outline-none min-h-[90px] resize-y placeholder:text-[#22c55e]/30"
                value={envText}
                onChange={(event) => setEnvText(event.target.value)}
                placeholder={`API_KEY=sk-...\nDEBUG=true`}
              />
            </div>

            <div className="flex flex-col gap-2 text-[#e8e3da] mt-1">
              <label className="uppercase font-bold text-[11px] tracking-wider">Accent Color</label>
              <div className="flex gap-4 flex-wrap">
                {PROJECT_SWATCHES.map((swatch) => {
                  const selected = color === swatch;
                  return (
                    <button
                      key={swatch}
                      className={`w-9 h-9 transition-all ${
                        selected 
                          ? "border-[3px] border-[#f5f0e8] shadow-[4px_4px_0px_0px_#555] translate-y-[-2px]" 
                          : "border-[3px] border-transparent hover:border-white/30"
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

        <div className="p-4 px-6 bg-[#1a1a1c] flex justify-between items-center shrink-0">
          <div className="text-[11px] font-bold text-[#dc2626] w-1/2 uppercase tracking-wide">
            {!name.trim() || !command.trim() ? "NAME AND COMMAND REQUIRED" : ""}
          </div>
          <div className="flex justify-end gap-6 items-center">
            <button 
              className="font-bold uppercase tracking-widest text-[#d1d5db] hover:text-white transition-all text-sm"
              onClick={onClose} 
              type="button"
            >
              Cancel
            </button>
            <button
              className="bg-[#1e40af] text-white border-2 border-transparent px-8 py-3 font-bold uppercase shadow-[4px_4px_0px_0px_#444] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed text-[13px] tracking-wide"
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
