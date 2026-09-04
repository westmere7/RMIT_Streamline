"use client";

import { ArrowRight, Zap } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const AUTOMATION_EXAMPLES: Array<{ when: string; then: string }> = [
  { when: "When status changes to Done", then: "notify the owner" },
  { when: "3 days before due date", then: "notify the assignee" },
  { when: "When item moves to Stakeholder Review", then: "notify the board owner" },
  { when: "When a new item is created", then: "assign the team lead" },
];

export function AutomationsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="size-4 text-amber-500" /> Automations <Badge variant="warning">Coming later</Badge>
          </DialogTitle>
          <DialogDescription>Automations will let the board react to changes without manual follow-up. None of these are active yet.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-1.5">
          {AUTOMATION_EXAMPLES.map((a) => (
            <li key={a.when} className="flex items-center gap-2 rounded-md border bg-surface px-3 py-2 text-[13px] opacity-80">
              <span className="font-medium">{a.when}</span>
              <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">{a.then}</span>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const INTEGRATIONS = ["Microsoft Teams", "Outlook", "OneDrive", "Google Drive", "Slack"];

export function IntegrationsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Integrations <Badge variant="warning">Coming later</Badge>
          </DialogTitle>
          <DialogDescription>Connect the tools the team already uses. No external services are connected in this build.</DialogDescription>
        </DialogHeader>
        <ul className="grid grid-cols-2 gap-1.5">
          {INTEGRATIONS.map((name) => (
            <li key={name} className="flex items-center justify-between rounded-md border px-3 py-2 text-[13px] opacity-80">
              {name}
              <Badge variant="muted">Soon</Badge>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
