import { useState } from "react";
import { KANBAN_COLUMNS, type KanbanStatus, useKanbanStore } from "../../store/kanbanStore";

interface KanbanBoardProps {
  projectId: string;
  projectName: string;
}

export function KanbanBoard({ projectId, projectName }: KanbanBoardProps) {
  const tasks = useKanbanStore((s) => s.tasks.filter((t) => t.projectId === projectId));
  const addTask = useKanbanStore((s) => s.addTask);
  const moveTask = useKanbanStore((s) => s.moveTask);
  const deleteTask = useKanbanStore((s) => s.deleteTask);
  const updateTask = useKanbanStore((s) => s.updateTask);

  const [drafts, setDrafts] = useState<Record<KanbanStatus, string>>({
    todo: "", "in-progress": "", done: "", blocked: "",
  });
  const [adding, setAdding] = useState<KanbanStatus | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [dragOverCol, setDragOverCol] = useState<KanbanStatus | null>(null);

  const handleAdd = (status: KanbanStatus) => {
    const title = drafts[status].trim();
    if (!title) return;
    addTask(projectId, status, title);
    setDrafts((d) => ({ ...d, [status]: "" }));
    setAdding(null);
  };

  const startEdit = (id: string, title: string) => {
    setEditingId(id);
    setEditText(title);
  };

  const commitEdit = (id: string) => {
    if (editText.trim()) updateTask(id, { title: editText.trim() });
    setEditingId(null);
    setEditText("");
  };

  const STATUSES = KANBAN_COLUMNS.map((c) => c.id);
  const nextStatus = (s: KanbanStatus): KanbanStatus => {
    const idx = STATUSES.indexOf(s);
    return STATUSES[(idx + 1) % STATUSES.length];
  };

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-3 border-b-2 border-[#333] shrink-0">
        <span className="font-['Space_Grotesk'] font-black text-xs uppercase tracking-widest text-[#ffcc00]">
          ◈ Kanban
        </span>
        <span className="text-[#444] text-xs font-mono">— {projectName}</span>
        <span className="ml-auto text-[#444] text-xs font-mono">{tasks.length} tasks</span>
      </div>

      {/* Columns */}
      <div className="flex flex-1 min-h-0 gap-0 overflow-x-auto">
        {KANBAN_COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.id);
          const isOver = dragOverCol === col.id;

          return (
            <div
              key={col.id}
              className={`flex flex-col flex-1 min-w-[200px] border-r-2 border-[#222] transition-colors ${isOver ? "bg-[#1a1a1a]" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.id); }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                if (id) moveTask(id, col.id);
                setDragOverCol(null);
              }}
            >
              {/* Column header */}
              <div
                className="flex items-center justify-between px-3 py-2 shrink-0 border-b-2 border-[#222]"
                style={{ background: col.bg, color: col.color }}
              >
                <span className="font-['Space_Grotesk'] font-black text-xs uppercase tracking-widest">
                  {col.label}
                </span>
                <span className="font-mono text-xs opacity-60">
                  {colTasks.length}
                </span>
              </div>

              {/* Task list */}
              <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
                {colTasks.map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", task.id)}
                    className="group bg-[#1a1a1a] border-2 border-[#333] p-2 cursor-grab active:cursor-grabbing hover:border-[#ffcc00] transition-colors"
                  >
                    {editingId === task.id ? (
                      <input
                        className="w-full bg-transparent text-[#f5f0e8] font-['Space_Grotesk'] text-xs outline-none border-b border-[#ffcc00]"
                        value={editText}
                        autoFocus
                        onChange={(e) => setEditText(e.target.value)}
                        onBlur={() => commitEdit(task.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEdit(task.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                    ) : (
                      <p
                        className="text-[#f5f0e8] font-['Space_Grotesk'] text-xs leading-tight select-none"
                        onDoubleClick={() => startEdit(task.id, task.title)}
                        title="Double-click to edit"
                      >
                        {task.title}
                      </p>
                    )}

                    {/* Actions row */}
                    <div className="flex items-center justify-between mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        className="text-[9px] font-['Space_Grotesk'] font-black uppercase px-1.5 py-0.5 border border-[#333] text-[#888] hover:text-[#ffcc00] hover:border-[#ffcc00]"
                        onClick={() => moveTask(task.id, nextStatus(task.status))}
                        title="Move to next status"
                        type="button"
                      >
                        → {nextStatus(task.status).replace("-", " ")}
                      </button>
                      <button
                        className="text-[9px] font-black text-[#444] hover:text-[#e63b2e] px-1"
                        onClick={() => deleteTask(task.id)}
                        title="Delete task"
                        type="button"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}

                {/* Add task input */}
                {adding === col.id ? (
                  <div className="border-2 border-[#ffcc00] bg-[#111] p-2">
                    <textarea
                      className="w-full bg-transparent text-[#f5f0e8] font-['Space_Grotesk'] text-xs resize-none outline-none placeholder-[#444] leading-tight"
                      placeholder="Task title…"
                      rows={2}
                      autoFocus
                      value={drafts[col.id]}
                      onChange={(e) => setDrafts((d) => ({ ...d, [col.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAdd(col.id); }
                        if (e.key === "Escape") { setAdding(null); }
                      }}
                    />
                    <div className="flex gap-2 mt-1">
                      <button
                        className="text-[9px] font-['Space_Grotesk'] font-black uppercase px-2 py-1 bg-[#ffcc00] text-[#1a1a1a] hover:bg-[#f0c000]"
                        onClick={() => handleAdd(col.id)}
                        type="button"
                      >
                        Add
                      </button>
                      <button
                        className="text-[9px] font-['Space_Grotesk'] font-black uppercase px-2 py-1 text-[#555] hover:text-[#f5f0e8]"
                        onClick={() => setAdding(null)}
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="text-left text-[10px] font-['Space_Grotesk'] uppercase font-bold text-[#333] hover:text-[#ffcc00] border border-dashed border-[#2a2a2a] hover:border-[#ffcc00] p-2 transition-colors"
                    onClick={() => setAdding(col.id)}
                    type="button"
                  >
                    + Add task
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
