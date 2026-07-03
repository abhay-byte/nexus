import { useState } from "react";

interface Props {
  projectId: string;
  projectName: string;
  onClose: () => void;
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-[#1a1a1a] text-[#10b981] p-3 my-2 overflow-x-auto text-[10px] leading-relaxed font-mono whitespace-pre-wrap border-l-2 border-[#ffcc00]">
      {children}
    </pre>
  );
}

const BASE = "http://127.0.0.1:7878";

export function LocalKanbanInstructions({ projectId, projectName, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [section, setSection] = useState<"api" | "docker">("api");

  const getApiMarkdown = () => `You can manage my Nexus local kanban board via the REST API on http://127.0.0.1:7878.

## Current Project
- **Name**: ${projectName}
- **ID**: ${projectId}

## Commands

### Get all tasks
\`\`\`bash
curl -s http://127.0.0.1:7878/api/kanban/tasks
\`\`\`

### Get tasks for this project only
\`\`\`bash
curl -s http://127.0.0.1:7878/api/kanban/tasks | python3 -c "
import sys, json
tasks = json.load(sys.stdin)
for t in tasks:
    if t.get('project_id') == '${projectId}':
        print(f'[{t[\"status\"]}] {t[\"title\"]}')
"
\`\`\`

### Create a task
\`\`\`bash
curl -s -X POST http://127.0.0.1:7878/api/kanban/tasks \\
  -H "Content-Type: application/json" \\
  -d '{"project_id": "${projectId}", "title": "Task title here", "status": "todo"}'
\`\`\`

### Move a task to another column
Status values: \`todo\`, \`in-progress\`, \`done\`, \`blocked\`
\`\`\`bash
curl -s -X PUT http://127.0.0.1:7878/api/kanban/tasks/<TASK_ID> \\
  -H "Content-Type: application/json" \\
  -d '{"id": "<TASK_ID>", "project_id": "${projectId}", "title": "Task title", "status": "done"}'
\`\`\`

### Delete a task
\`\`\`bash
curl -s -X DELETE http://127.0.0.1:7878/api/kanban/tasks/<TASK_ID>
\`\`\`

### Refresh board (do this after making changes)
\`\`\`bash
curl -s -X POST http://127.0.0.1:7878/api/kanban/refresh
\`\`\`

Always call the refresh endpoint after creating, updating, or deleting tasks so the board reflects your changes.
`;

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(getApiMarkdown()); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = getApiMarkdown(); document.body.appendChild(ta);
      ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#f5f0e8] dark:bg-[#1a1a1a] border-4 border-black dark:border-[#333] shadow-[8px_8px_0px_0px_#000] dark:shadow-[8px_8px_0px_0px_#333] w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-black dark:border-[#333] bg-[#ffcc00] shrink-0">
          <span className="font-['Space_Grotesk'] font-black text-xs uppercase tracking-widest text-[#1a1a1a]">Agent Instructions — {projectName}</span>
          <button onClick={onClose} className="text-[#1a1a1a] hover:text-[#e63b2e] font-black text-lg leading-none" type="button">✕</button>
        </div>

        <div className="flex border-b-2 border-black dark:border-[#333] shrink-0">
          <button onClick={() => setSection("api")} className={`flex-1 px-3 py-2 text-[10px] font-['Space_Grotesk'] font-black uppercase ${section === "api" ? "bg-[#ffcc00] text-[#1a1a1a]" : "text-[#888] hover:text-[#ffcc00]"}`} type="button">API Instructions</button>
          <button onClick={() => setSection("docker")} className={`flex-1 px-3 py-2 text-[10px] font-['Space_Grotesk'] font-black uppercase ${section === "docker" ? "bg-[#ffcc00] text-[#1a1a1a]" : "text-[#888] hover:text-[#ffcc00]"}`} type="button">Docker / Self-Host</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 text-xs text-[#1a1a1a] dark:text-[#ddd]">
          {section === "api" ? (
            <>
              <p className="mb-3">You can manage my Nexus local kanban board via the REST API on <code className="bg-[#e8e3da] dark:bg-[#333] px-1 py-0.5 text-[11px] font-mono">{BASE}</code>.</p>

              <h2 className="font-['Space_Grotesk'] font-black text-sm uppercase tracking-wide mb-2 mt-4">Current Project</h2>
              <ul className="list-disc pl-5 mb-3 space-y-0.5">
                <li><strong>Name</strong>: {projectName}</li>
                <li><strong>ID</strong>: {projectId}</li>
              </ul>

              <h2 className="font-['Space_Grotesk'] font-black text-sm uppercase tracking-wide mb-2 mt-4">Commands</h2>

              <h3 className="font-['Space_Grotesk'] font-bold text-xs mt-3 mb-1">Get all tasks</h3>
              <CodeBlock>{`curl -s ${BASE}/api/kanban/tasks`}</CodeBlock>

              <h3 className="font-['Space_Grotesk'] font-bold text-xs mt-3 mb-1">Get tasks for this project only</h3>
              <CodeBlock>{`curl -s ${BASE}/api/kanban/tasks | python3 -c "
import sys, json
tasks = json.load(sys.stdin)
for t in tasks:
    if t.get('project_id') == '${projectId}':
        print(f'[{t["status"]}] {t["title"]}')
"`}</CodeBlock>

              <h3 className="font-['Space_Grotesk'] font-bold text-xs mt-3 mb-1">Create a task</h3>
              <CodeBlock>{`curl -s -X POST ${BASE}/api/kanban/tasks \\
  -H "Content-Type: application/json" \\
  -d '{"project_id": "${projectId}", "title": "Task title here", "status": "todo"}'`}</CodeBlock>

              <h3 className="font-['Space_Grotesk'] font-bold text-xs mt-3 mb-1">Move a task to another column</h3>
              <p className="mb-1">Status values: <code className="bg-[#e8e3da] dark:bg-[#333] px-1 py-0.5 font-mono">todo</code>, <code className="bg-[#e8e3da] dark:bg-[#333] px-1 py-0.5 font-mono">in-progress</code>, <code className="bg-[#e8e3da] dark:bg-[#333] px-1 py-0.5 font-mono">done</code>, <code className="bg-[#e8e3da] dark:bg-[#333] px-1 py-0.5 font-mono">blocked</code></p>
              <CodeBlock>{`curl -s -X PUT ${BASE}/api/kanban/tasks/<TASK_ID> \\
  -H "Content-Type: application/json" \\
  -d '{"id": "<TASK_ID>", "project_id": "${projectId}", "title": "Task title", "status": "done"}'`}</CodeBlock>

              <h3 className="font-['Space_Grotesk'] font-bold text-xs mt-3 mb-1">Delete a task</h3>
              <CodeBlock>{`curl -s -X DELETE ${BASE}/api/kanban/tasks/<TASK_ID>`}</CodeBlock>

              <h3 className="font-['Space_Grotesk'] font-bold text-xs mt-3 mb-1">Refresh board (do this after making changes)</h3>
              <CodeBlock>{`curl -s -X POST ${BASE}/api/kanban/refresh`}</CodeBlock>

              <p className="mt-3 text-[#555] dark:text-[#888] italic">Always call the refresh endpoint after creating, updating, or deleting tasks so the board reflects your changes.</p>
            </>
          ) : (
            <>
              <h1 className="font-['Space_Grotesk'] font-black text-sm uppercase tracking-wide mb-3">How to Host Planka Yourself</h1>

              <h2 className="font-['Space_Grotesk'] font-bold text-xs mt-3 mb-1">Option 1: Docker Compose (Recommended)</h2>
              <p className="mb-1">Create a <code className="bg-[#e8e3da] dark:bg-[#333] px-1 py-0.5 font-mono">docker-compose.yml</code>:</p>
              <CodeBlock>{`version: '3.8'
services:
  planka:
    image: ghcr.io/plankanban/planka:latest
    ports:
      - "5000:1337"
    environment:
      - BASE_URL=http://localhost:5000
      - DATABASE_URL=postgresql://postgres:postgres@planka-db:5432/planka
      - SECRET_KEY=your-secret-key-change-this
    depends_on:
      - planka-db
    restart: unless-stopped
  planka-db:
    image: postgres:16-alpine
    volumes:
      - planka-data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=planka
      - POSTGRES_PASSWORD=postgres
    restart: unless-stopped
volumes:
  planka-data:`}</CodeBlock>
              <p className="mb-1">Run:</p>
              <CodeBlock>docker compose up -d</CodeBlock>

              <h2 className="font-['Space_Grotesk'] font-bold text-xs mt-4 mb-1">Option 2: Deploy on Render.com</h2>
              <ol className="list-decimal pl-5 mb-3 space-y-0.5">
                <li>Fork github.com/plankanban/planka</li>
                <li>Create a new Web Service on Render</li>
                <li>Build command: <code className="bg-[#e8e3da] dark:bg-[#333] px-1 py-0.5 font-mono">npm install && npm run build</code></li>
                <li>Start command: <code className="bg-[#e8e3da] dark:bg-[#333] px-1 py-0.5 font-mono">npm start</code></li>
                <li>Environment variables:
                  <ul className="list-disc pl-5 mt-0.5">
                    <li><code className="bg-[#e8e3da] dark:bg-[#333] px-1 py-0.5 font-mono">BASE_URL</code>: https://your-app.onrender.com</li>
                    <li><code className="bg-[#e8e3da] dark:bg-[#333] px-1 py-0.5 font-mono">DATABASE_URL</code>: Your PostgreSQL URL</li>
                    <li><code className="bg-[#e8e3da] dark:bg-[#333] px-1 py-0.5 font-mono">SECRET_KEY</code>: Random secret string</li>
                  </ul>
                </li>
              </ol>

              <h2 className="font-['Space_Grotesk'] font-bold text-xs mt-4 mb-1">Option 3: Supabase PostgreSQL</h2>
              <ol className="list-decimal pl-5 mb-3 space-y-0.5">
                <li>Create a Supabase project</li>
                <li>Go to Project Settings → Database → Connection string</li>
                <li>Use the IPv4 pooled connector (port 6543):</li>
              </ol>
              <CodeBlock>postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true</CodeBlock>
              <p className="mt-1">Use this as the <code className="bg-[#e8e3da] dark:bg-[#333] px-1 py-0.5 font-mono">DATABASE_URL</code> for your Planka instance.</p>
            </>
          )}
        </div>

        <div className="flex justify-end px-4 py-3 border-t-2 border-black dark:border-[#333] shrink-0 gap-2">
          {section === "api" && (
            <button onClick={handleCopy} className="text-xs font-['Space_Grotesk'] font-black uppercase px-4 py-2 bg-[#ffcc00] text-[#1a1a1a] border-2 border-black hover:bg-[#f0c000]" type="button">{copied ? "✓ Copied!" : "Copy to Clipboard"}</button>
          )}
          <button onClick={onClose} className="text-xs font-['Space_Grotesk'] font-black uppercase px-4 py-2 border-2 border-black dark:border-[#333] text-[#1a1a1a] dark:text-[#f5f0e8] hover:bg-white dark:hover:bg-[#333]" type="button">Close</button>
        </div>
      </div>
    </div>
  );
}
