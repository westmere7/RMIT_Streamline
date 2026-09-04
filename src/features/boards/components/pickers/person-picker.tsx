"use client";

import { Check, X } from "lucide-react";
import * as React from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { User } from "@/domain";
import { cn } from "@/lib/utils";

export interface PersonPickerProps {
  users: User[];
  value: string[];
  onChange: (userIds: string[]) => void;
  allowMultiple?: boolean;
  /** Called after a single-select choice so popovers can close. */
  onDone?: () => void;
}

/** Searchable member picker supporting single and multiple assignment. */
export function PersonPicker({ users, value, onChange, allowMultiple = true, onDone }: PersonPickerProps) {
  const selected = value.map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u);
  const available = users.filter((u) => u.deactivatedAt === null);

  const toggle = (userId: string) => {
    if (allowMultiple) {
      onChange(value.includes(userId) ? value.filter((id) => id !== userId) : [...value, userId]);
    } else {
      onChange(value.includes(userId) ? [] : [userId]);
      onDone?.();
    }
  };

  return (
    <div className="w-64" data-testid="person-picker">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b p-2">
          {selected.map((user) => (
            <span key={user.id} className="inline-flex h-6 items-center gap-1 rounded-full bg-surface-strong pr-1 pl-0.5 text-xs">
              <UserAvatar user={user} size="xs" tooltip={false} />
              <span className="max-w-28 truncate">{user.firstName}</span>
              <button
                type="button"
                aria-label={`Remove ${user.displayName}`}
                onClick={() => onChange(value.filter((id) => id !== user.id))}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Command>
        <CommandInput placeholder="Search people…" autoFocus />
        <CommandList className="max-h-64">
          <CommandEmpty>No people found.</CommandEmpty>
          <CommandGroup>
            {available.map((user) => {
              const isSelected = value.includes(user.id);
              return (
                <CommandItem key={user.id} value={`${user.displayName} ${user.email} ${user.jobTitle ?? ""}`} onSelect={() => toggle(user.id)}>
                  <UserAvatar user={user} size="sm" tooltip={false} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{user.displayName}</span>
                    <span className="block truncate text-2xs text-muted-foreground">{user.jobTitle}</span>
                  </span>
                  <Check className={cn("size-4", isSelected ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );
}
