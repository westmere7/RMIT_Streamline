"use client";

import { Blocks, Database, FileStack, HardDrive, Layers, MonitorSmartphone, Server, ShieldCheck, TestTubes, Workflow } from "lucide-react";
import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useDataContext } from "@/features/data/data-context";

/**
 * What Streamline is built from, opened from the About dialog. Major versions
 * only: the exact ones live in package.json and change every week.
 */
interface Part {
  name: string;
  version?: string;
  role: string;
}

interface Layer {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  parts: Part[];
}

const STACK: Layer[] = [
  {
    title: "Interface",
    icon: MonitorSmartphone,
    parts: [
      { name: "Next.js", version: "16", role: "App Router, server components, route handlers" },
      { name: "React", version: "19", role: "Interface, transitions, external stores" },
      { name: "TypeScript", version: "5", role: "Strict types end to end" },
      { name: "Tailwind CSS", version: "4", role: "Styling, light and dark themes" },
      { name: "Radix UI", role: "Dialogs, menus, popovers, accessible primitives" },
      { name: "Lucide", role: "Icons" },
      { name: "Sonner", role: "Toasts" },
      { name: "cmdk", role: "Searchable pickers" },
    ],
  },
  {
    title: "State and data fetching",
    icon: Layers,
    parts: [
      { name: "TanStack Query", version: "5", role: "Server cache, optimistic updates, polling" },
      { name: "TanStack Virtual", version: "3", role: "Long boards and lists" },
      { name: "Zustand", version: "5", role: "Small shared stores" },
      { name: "Zod", version: "4", role: "Validation in the browser and on the server" },
      { name: "React Hook Form", version: "7", role: "Forms" },
    ],
  },
  {
    title: "Editing and interaction",
    icon: Blocks,
    parts: [
      { name: "Tiptap", version: "3", role: "Rich text, mentions, checklists" },
      { name: "dnd kit", role: "Drag and drop for tasks, groups, columns and lanes" },
      { name: "React Day Picker", version: "10", role: "Dates and timelines" },
      { name: "date-fns", version: "4", role: "Date arithmetic and working days" },
    ],
  },
  {
    title: "Database",
    icon: Database,
    parts: [
      { name: "Supabase Postgres", role: "Every workspace, board, task and update" },
      { name: "Row-level security", role: "Who sees and edits what, enforced in the database" },
      { name: "Security-definer functions", role: "Tickets, keys, board viewers, guarded writes" },
      { name: "Triggers", role: "Automation events, revisions, integrity guards" },
      { name: "pg_cron + pg_net", role: "Runs the automations every minute" },
    ],
  },
  {
    title: "Platform services",
    icon: ShieldCheck,
    parts: [
      { name: "Supabase Auth", role: "Sign-in, join links, sessions" },
      { name: "Supabase Realtime", role: "Live boards, presence dots, change feeds" },
      { name: "Supabase Storage", role: "Covers, avatars, doc files" },
    ],
  },
  {
    title: "Server",
    icon: Server,
    parts: [
      { name: "Next.js route handlers", role: "Booking, portal, allocation, sharing, automations" },
      { name: "Service role", role: "Server-only work behind each route's own checks" },
      { name: "postgres.js", version: "3", role: "Migrations, snapshots, re-allocation" },
    ],
  },
  {
    title: "Files and exports",
    icon: FileStack,
    parts: [
      { name: "ExcelJS", version: "4", role: "Tracker sheets in and out of Excel" },
      { name: "jsPDF", version: "4", role: "Dashboard reports and booking receipts" },
      { name: "JSZip", version: "3", role: "Rich text out to Word" },
      { name: "Mammoth", role: "Word documents into docs" },
    ],
  },
  {
    title: "Offline and demo",
    icon: HardDrive,
    parts: [
      { name: "IndexedDB (idb)", version: "8", role: "The local demo workspace, all in the browser" },
      { name: "Repository layer", role: "One set of services over Supabase or the browser" },
    ],
  },
  {
    title: "Hosting and delivery",
    icon: Workflow,
    parts: [
      { name: "Vercel", role: "Builds and hosting, Node.js 22" },
      { name: "Supabase Cloud", role: "Database, auth, realtime and storage" },
      { name: "Self-applying migrations", role: "Run in order on every build" },
      { name: "GitHub", role: "Source, history and keep-alive jobs" },
    ],
  },
  {
    title: "Quality",
    icon: TestTubes,
    parts: [
      { name: "Vitest", version: "4", role: "Unit and service tests" },
      { name: "Testing Library", role: "Component tests on happy-dom" },
      { name: "Playwright", role: "End-to-end runs in a real browser" },
      { name: "ESLint", version: "9", role: "Linting" },
      { name: "Disposable Supabase", role: "Permission and security checks on a local copy" },
    ],
  },
];

export function TechStackDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { providerKind } = useDataContext();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[85vh] overflow-hidden p-0 sm:max-w-[760px]" data-testid="tech-stack-dialog">
        <div className="border-b border-border/70 px-6 pt-6 pb-4 sm:px-8">
          <DialogTitle className="text-base">Tech stack</DialogTitle>
          <DialogDescription className="mt-1 text-2xs">
            This copy keeps its data {providerKind === "supabase" ? "on the server, shared with the team" : "in this browser only"}.
          </DialogDescription>
        </div>
        <div className="scrollbar-thin grid max-h-[calc(85vh-6rem)] gap-x-8 gap-y-6 overflow-y-auto px-6 py-5 sm:grid-cols-2 sm:px-8">
          {STACK.map((layer) => (
            <section key={layer.title} className="min-w-0">
              <h3 className="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                <layer.icon className="size-3.5" aria-hidden />
                {layer.title}
              </h3>
              <ul className="divide-y divide-border/50">
                {layer.parts.map((part) => (
                  <li key={part.name} className="py-1.5">
                    <span className="flex items-center gap-1.5 text-[13px]">
                      <span className="font-medium text-foreground">{part.name}</span>
                      {part.version && <span className="rounded bg-surface-strong px-1 text-[10px] text-muted-foreground tabular">{part.version}</span>}
                    </span>
                    <span className="mt-0.5 block text-2xs leading-snug text-muted-foreground">{part.role}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
