import { useState } from "react";

interface Props {
  config?: {
    baseUrl: string;
    email: string;
    password?: string;
    token?: string;
    selectedProjectId?: string;
    selectedProjectName?: string;
    selectedBoardId?: string;
    selectedBoardName?: string;
  };
  onClose: () => void;
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-[#1a1a1a] text-[#10b981] p-3 my-2 overflow-x-auto text-[10px] leading-relaxed font-mono whitespace-pre-wrap border-l-2 border-[#ffcc00]">
      {children}
    </pre>
  );
}

export function PlankaInstructions({ config, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [section, setSection] = useState<"api" | "setup">(config?.token ? "api" : "setup");
  const baseUrl = config?.baseUrl || "<PLANKA_URL>";

  const getApiMarkdown = () => `You can interact with my Planka kanban board via its REST API.

# Authentication
Base URL: ${config?.baseUrl || "<PLANKA_URL>"}

Get a token:
\`\`\`bash
curl -X POST ${config?.baseUrl || "<PLANKA_URL>"}/api/access-tokens \\
  -H "Content-Type: application/json" \\
  -d '{"emailOrUsername": "${config?.email || "<EMAIL>"}", "password": "${config?.password || "<PASSWORD>"}"}'
\`\`\`

# Current Context
${config?.selectedBoardId ? `- **Project**: ${config.selectedProjectName} (id: ${config.selectedProjectId})
- **Board**: ${config.selectedBoardName} (id: ${config.selectedBoardId})` : `- Not connected to any board yet.`}

# API Endpoints

## Get board details (includes lists)
\`\`\`bash
curl -s ${config?.baseUrl || "<PLANKA_URL>"}/api/boards/BOARD_ID \\
  -H "Authorization: Bearer $TOKEN"
\`\`\`

## Get cards in a list
\`\`\`bash
curl -s ${config?.baseUrl || "<PLANKA_URL>"}/api/lists/LIST_ID/cards \\
  -H "Authorization: Bearer $TOKEN"
\`\`\`

## Create a card
\`\`\`bash
curl -s -X POST ${config?.baseUrl || "<PLANKA_URL>"}/api/lists/LIST_ID/cards \\
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  -d '{"name": "Card Title", "boardId": "BOARD_ID", "position": 1, "type": "project"}'
\`\`\`

## Move a card
\`\`\`bash
curl -s -X PATCH ${config?.baseUrl || "<PLANKA_URL>"}/api/cards/CARD_ID \\
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  -d '{"listId": "NEW_LIST_ID", "boardId": "BOARD_ID", "position": 1}'
\`\`\`

## Delete a card
\`\`\`bash
curl -s -X DELETE ${config?.baseUrl || "<PLANKA_URL>"}/api/cards/CARD_ID \\
  -H "Authorization: Bearer $TOKEN"
\`\`\`

## Create a list
\`\`\`bash
curl -s -X POST ${config?.baseUrl || "<PLANKA_URL>"}/api/boards/BOARD_ID/lists \\
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  -d '{"name": "List Name", "position": 1, "type": "active"}'
\`\`\`

## Create a project
\`\`\`bash
curl -s -X POST ${config?.baseUrl || "<PLANKA_URL>"}/api/projects \\
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  -d '{"name": "Project Name", "type": "private"}'
\`\`\`

## Create a board
\`\`\`bash
curl -s -X POST ${config?.baseUrl || "<PLANKA_URL>"}/api/projects/PROJECT_ID/boards \\
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  -d '{"name": "Board Name", "position": 1}'
\`\`\`

## Required Fields
- Projects: \`type\` = "private"
- Lists: \`type\` = "active"
- Cards: \`type\` = "project", also need \`boardId\`
- Moving cards: need \`listId\`, \`boardId\`, \`position\`
- Deleting project: delete all boards first`;

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
          <span className="font-['Space_Grotesk'] font-black text-xs uppercase tracking-widest text-[#1a1a1a]">Planka Agent Instructions</span>
          <button onClick={onClose} className="text-[#1a1a1a] hover:text-[#e63b2e] font-black text-lg leading-none" type="button">✕</button>
        </div>

        <div className="flex border-b-2 border-black dark:border-[#333] shrink-0">
          {config?.token && (
            <button onClick={() => setSection("api")} className={`flex-1 px-3 py-2 text-[10px] font-['Space_Grotesk'] font-black uppercase ${section === "api" ? "bg-[#ffcc00] text-[#1a1a1a]" : "text-[#888] hover:text-[#ffcc00]"}`} type="button">API Instructions</button>
          )}
          <button onClick={() => setSection("setup")} className={`flex-1 px-3 py-2 text-[10px] font-['Space_Grotesk'] font-black uppercase ${section === "setup" || !config?.token ? "bg-[#ffcc00] text-[#1a1a1a]" : "text-[#888] hover:text-[#ffcc00]"}`} type="button">Docker / Self-Host</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 text-xs text-[#1a1a1a] dark:text-[#ddd]">
          {section === "setup" ? (
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
                <li>Fork <a href="https://github.com/plankanban/planka" className="text-[#ffcc00] underline" target="_blank" rel="noopener noreferrer">github.com/plankanban/planka</a></li>
                <li>Create a new <strong>Web Service</strong> on Render</li>
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
                <li>Use the <strong>IPv4 pooled</strong> connector (port 6543):</li>
              </ol>
              <CodeBlock>postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true</CodeBlock>
              <p className="mt-1">Use this as the <code className="bg-[#e8e3da] dark:bg-[#333] px-1 py-0.5 font-mono">DATABASE_URL</code> for your Planka instance.</p>

              <h2 className="font-['Space_Grotesk'] font-bold text-xs mt-4 mb-1">First-Time Setup</h2>
              <ol className="list-decimal pl-5 mb-3 space-y-0.5">
                <li>Open Planka in your browser</li>
                <li>Create an admin account (first user becomes admin automatically)</li>
                <li>Create a project, then a board, then start adding cards</li>
              </ol>
            </>
          ) : (
            <>
              <p className="mb-3">You can interact with my Planka kanban board via its REST API.</p>

              <h2 className="font-['Space_Grotesk'] font-black text-sm uppercase tracking-wide mb-2 mt-4">Authentication</h2>
              <p className="mb-1">Base URL: <code className="bg-[#e8e3da] dark:bg-[#333] px-1 py-0.5 font-mono">{baseUrl}</code></p>
              <p className="mb-1">Get a token:</p>
              <CodeBlock>{`curl -X POST ${baseUrl}/api/access-tokens \\
  -H "Content-Type: application/json" \\
  -d '{"emailOrUsername": "${config?.email || "<EMAIL>"}", "password": "${config?.password || "<PASSWORD>"}"}'`}</CodeBlock>

              <h2 className="font-['Space_Grotesk'] font-black text-sm uppercase tracking-wide mb-2 mt-4">Current Context</h2>
              {config?.selectedBoardId ? (
                <ul className="list-disc pl-5 mb-3 space-y-0.5">
                  <li><strong>Project</strong>: {config.selectedProjectName} (id: {config.selectedProjectId})</li>
                  <li><strong>Board</strong>: {config.selectedBoardName} (id: {config.selectedBoardId})</li>
                </ul>
              ) : (
                <ul className="list-disc pl-5 mb-3 space-y-0.5">
                  <li>Not connected to any board yet.</li>
                </ul>
              )}

              <h2 className="font-['Space_Grotesk'] font-black text-sm uppercase tracking-wide mb-2 mt-4">API Endpoints</h2>

              <h3 className="font-['Space_Grotesk'] font-bold text-xs mt-3 mb-1">Get board details (includes lists)</h3>
              <CodeBlock>{`curl -s ${baseUrl}/api/boards/BOARD_ID \\
  -H "Authorization: Bearer $TOKEN"`}</CodeBlock>

              <h3 className="font-['Space_Grotesk'] font-bold text-xs mt-3 mb-1">Get cards in a list</h3>
              <CodeBlock>{`curl -s ${baseUrl}/api/lists/LIST_ID/cards \\
  -H "Authorization: Bearer $TOKEN"`}</CodeBlock>

              <h3 className="font-['Space_Grotesk'] font-bold text-xs mt-3 mb-1">Create a card</h3>
              <CodeBlock>{`curl -s -X POST ${baseUrl}/api/lists/LIST_ID/cards \\
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  -d '{"name": "Card Title", "boardId": "BOARD_ID", "position": 1, "type": "project"}'`}</CodeBlock>

              <h3 className="font-['Space_Grotesk'] font-bold text-xs mt-3 mb-1">Move a card</h3>
              <CodeBlock>{`curl -s -X PATCH ${baseUrl}/api/cards/CARD_ID \\
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  -d '{"listId": "NEW_LIST_ID", "boardId": "BOARD_ID", "position": 1}'`}</CodeBlock>

              <h3 className="font-['Space_Grotesk'] font-bold text-xs mt-3 mb-1">Delete a card</h3>
              <CodeBlock>{`curl -s -X DELETE ${baseUrl}/api/cards/CARD_ID \\
  -H "Authorization: Bearer $TOKEN"`}</CodeBlock>

              <h3 className="font-['Space_Grotesk'] font-bold text-xs mt-3 mb-1">Create a list</h3>
              <CodeBlock>{`curl -s -X POST ${baseUrl}/api/boards/BOARD_ID/lists \\
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  -d '{"name": "List Name", "position": 1, "type": "active"}'`}</CodeBlock>

              <h3 className="font-['Space_Grotesk'] font-bold text-xs mt-3 mb-1">Create a project</h3>
              <CodeBlock>{`curl -s -X POST ${baseUrl}/api/projects \\
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  -d '{"name": "Project Name", "type": "private"}'`}</CodeBlock>

              <h3 className="font-['Space_Grotesk'] font-bold text-xs mt-3 mb-1">Create a board</h3>
              <CodeBlock>{`curl -s -X POST ${baseUrl}/api/projects/PROJECT_ID/boards \\
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  -d '{"name": "Board Name", "position": 1}'`}</CodeBlock>

              <h2 className="font-['Space_Grotesk'] font-black text-sm uppercase tracking-wide mb-2 mt-4">Required Fields</h2>
              <ul className="list-disc pl-5 mb-3 space-y-0.5">
                <li>Projects: <code className="bg-[#e8e3da] dark:bg-[#333] px-1 py-0.5 font-mono">type</code> = "private"</li>
                <li>Lists: <code className="bg-[#e8e3da] dark:bg-[#333] px-1 py-0.5 font-mono">type</code> = "active"</li>
                <li>Cards: <code className="bg-[#e8e3da] dark:bg-[#333] px-1 py-0.5 font-mono">type</code> = "project", also need <code className="bg-[#e8e3da] dark:bg-[#333] px-1 py-0.5 font-mono">boardId</code></li>
                <li>Moving cards: need <code className="bg-[#e8e3da] dark:bg-[#333] px-1 py-0.5 font-mono">listId</code>, <code className="bg-[#e8e3da] dark:bg-[#333] px-1 py-0.5 font-mono">boardId</code>, <code className="bg-[#e8e3da] dark:bg-[#333] px-1 py-0.5 font-mono">position</code></li>
                <li>Deleting project: delete all boards first</li>
              </ul>
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
