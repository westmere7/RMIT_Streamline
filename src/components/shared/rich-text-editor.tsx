"use client";

import { Bold, Heading1, Heading2, Italic, Link2, List, ListOrdered, Palette } from "lucide-react";
import * as React from "react";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import type { User } from "@/domain";
import { UserAvatar } from "@/components/shared/user-avatar";
import { continueList, RICH_TEXT_COLORS, togglePrefix, wrapSelection, type RichTextColor } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

/** The swatch shown in the colour menu, and the colour it writes. */
const SWATCHES: Record<RichTextColor, string> = {
  red: "bg-red-500",
  orange: "bg-orange-500",
  green: "bg-green-600",
  blue: "bg-blue-600",
  purple: "bg-purple-600",
  grey: "bg-gray-400",
};

export interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Cmd/Ctrl + Enter. */
  onSubmit?: () => void;
  people: readonly User[];
  placeholder?: string;
  rows?: number;
  ariaLabel: string;
  testId?: string;
  autoFocus?: boolean;
  className?: string;
}

/**
 * The update composer: a plain textarea, plus the few things that make writing
 * an update pleasant — a toolbar that writes the markup for you, lists that
 * continue themselves, and a name picker that appears as soon as you type "@".
 *
 * It stays a textarea on purpose. A contenteditable would need sanitising on the
 * way in and out; here what is stored is exactly what was typed.
 */
export function RichTextEditor({
  value,
  onChange,
  onSubmit,
  people,
  placeholder,
  rows = 3,
  ariaLabel,
  testId,
  autoFocus,
  className,
}: RichTextEditorProps) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = React.useState<{ query: string; start: number } | null>(null);
  const [highlighted, setHighlighted] = React.useState(0);
  const [colorsOpen, setColorsOpen] = React.useState(false);

  const matches = React.useMemo(() => {
    if (!mention) return [];
    const query = mention.query.toLowerCase();
    const active = people.filter((person) => person.deactivatedAt === null);
    if (!query) return active.slice(0, 6);

    // Someone typing "@jun" means Jun, not the Junior Designer: a name that
    // starts with what was typed comes first, then any other name, and only
    // then a job title that happens to contain it.
    const rank = (person: (typeof active)[number]): number => {
      const name = person.displayName.toLowerCase();
      if (name.startsWith(query)) return 0;
      if (name.split(/\s+/).some((part) => part.startsWith(query))) return 1;
      if (name.includes(query)) return 2;
      if ((person.jobTitle ?? "").toLowerCase().includes(query)) return 3;
      return 4;
    };
    return active
      .map((person) => ({ person, rank: rank(person) }))
      .filter((entry) => entry.rank < 4)
      .sort((a, b) => a.rank - b.rank || a.person.displayName.localeCompare(b.person.displayName))
      .slice(0, 6)
      .map((entry) => entry.person);
  }, [mention, people]);

  /** Applies an edit and puts the caret where the helper asked. */
  const apply = (next: { value: string; selectionStart: number; selectionEnd: number }) => {
    onChange(next.value);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.selectionStart, next.selectionEnd);
    });
  };

  const selection = () => {
    const el = ref.current;
    return { start: el?.selectionStart ?? value.length, end: el?.selectionEnd ?? value.length };
  };

  const wrap = (before: string, after: string, placeholderText: string) => {
    const { start, end } = selection();
    apply(wrapSelection(value, start, end, before, after, placeholderText));
  };

  const prefix = (build: (index: number) => string) => {
    const { start, end } = selection();
    apply(togglePrefix(value, start, end, build));
  };

  const insertLink = () => {
    const { start, end } = selection();
    const selected = value.slice(start, end);
    // A selected address becomes the target; selected words become the label.
    const isUrl = /^https?:\/\/\S+$/i.test(selected.trim());
    const next = isUrl
      ? wrapSelection(value, start, end, "[label](", ")", "")
      : wrapSelection(value, start, end, "[", "](https://)", "label");
    apply(next);
  };

  /** Watches the text just typed for an "@" that should open the name picker. */
  const syncMention = (nextValue: string, caret: number) => {
    const upToCaret = nextValue.slice(0, caret);
    const match = /(^|\s)@([\p{L}\p{N}'. -]{0,40})$/u.exec(upToCaret);
    if (!match) {
      setMention(null);
      return;
    }
    setMention({ query: match[2] ?? "", start: caret - (match[2]?.length ?? 0) - 1 });
    setHighlighted(0);
  };

  const chooseMention = (person: User) => {
    if (!mention) return;
    const before = value.slice(0, mention.start);
    const after = value.slice(mention.start + 1 + mention.query.length);
    const insertion = `@${person.displayName} `;
    setMention(null);
    apply({
      value: `${before}${insertion}${after}`,
      selectionStart: before.length + insertion.length,
      selectionEnd: before.length + insertion.length,
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && matches.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlighted((index) => (index + 1) % matches.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlighted((index) => (index - 1 + matches.length) % matches.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        chooseMention(matches[Math.min(highlighted, matches.length - 1)]!);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMention(null);
        return;
      }
    }

    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onSubmit?.();
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      // Carry a list on to the next line, and end it on an empty item.
      const el = event.currentTarget;
      const caret = el.selectionStart ?? 0;
      if (caret !== (el.selectionEnd ?? caret)) return;
      const lineStart = value.lastIndexOf("\n", caret - 1) + 1;
      const currentLine = value.slice(lineStart, caret);
      const nextPrefix = continueList(currentLine);
      if (nextPrefix === null) return;
      event.preventDefault();
      if (nextPrefix === "") {
        // The empty item goes away and the list ends.
        apply({ value: `${value.slice(0, lineStart)}${value.slice(caret)}`, selectionStart: lineStart, selectionEnd: lineStart });
        return;
      }
      const insertion = `\n${nextPrefix}`;
      apply({
        value: `${value.slice(0, caret)}${insertion}${value.slice(caret)}`,
        selectionStart: caret + insertion.length,
        selectionEnd: caret + insertion.length,
      });
    }
  };

  return (
    <div className={cn("relative", className)}>
      <div className="mb-1.5 flex flex-wrap items-center gap-0.5" role="toolbar" aria-label="Formatting">
        <ToolButton label="Bold" onClick={() => wrap("**", "**", "bold text")} testId="format-bold">
          <Bold className="size-3.5" />
        </ToolButton>
        <ToolButton label="Italic" onClick={() => wrap("*", "*", "italic text")} testId="format-italic">
          <Italic className="size-3.5" />
        </ToolButton>
        <ToolButton label="Large text" onClick={() => prefix(() => "# ")} testId="format-h1">
          <Heading1 className="size-3.5" />
        </ToolButton>
        <ToolButton label="Medium text" onClick={() => prefix(() => "## ")} testId="format-h2">
          <Heading2 className="size-3.5" />
        </ToolButton>
        <span aria-hidden className="mx-0.5 h-4 w-px bg-border/70" />
        <ToolButton label="Bulleted list" onClick={() => prefix(() => "- ")} testId="format-bullets">
          <List className="size-3.5" />
        </ToolButton>
        <ToolButton label="Numbered list" onClick={() => prefix((index) => `${index + 1}. `)} testId="format-numbers">
          <ListOrdered className="size-3.5" />
        </ToolButton>
        <ToolButton label="Link" onClick={insertLink} testId="format-link">
          <Link2 className="size-3.5" />
        </ToolButton>
        <span aria-hidden className="mx-0.5 h-4 w-px bg-border/70" />
        <div className="relative">
          <ToolButton label="Colour" onClick={() => setColorsOpen((open) => !open)} testId="format-color" pressed={colorsOpen}>
            <Palette className="size-3.5" />
          </ToolButton>
          {colorsOpen && (
            <div className="absolute top-full left-0 z-20 mt-1 flex gap-1 rounded-lg border border-border/70 bg-popover p-1.5 shadow-lg" data-testid="color-palette">
              {RICH_TEXT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={color}
                  data-testid={`color-${color}`}
                  onClick={() => {
                    setColorsOpen(false);
                    wrap(`{c:${color}}`, "{/c}", "coloured text");
                  }}
                  className={cn("size-4 rounded-full ring-offset-1 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-ring", SWATCHES[color])}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <Textarea
        ref={ref}
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => {
          onChange(event.target.value);
          syncMention(event.target.value, event.target.selectionStart ?? event.target.value.length);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setMention(null), 120)}
        placeholder={placeholder}
        rows={rows}
        aria-label={ariaLabel}
        data-testid={testId}
      />

      {mention && matches.length > 0 && (
        <ul
          className="absolute right-0 bottom-full left-0 z-30 mb-1 max-h-56 overflow-y-auto rounded-xl border border-border/70 bg-popover p-1 shadow-lg"
          role="listbox"
          aria-label="People to mention"
          data-testid="mention-list"
        >
          {matches.map((person, index) => (
            <li key={person.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlighted}
                onMouseDown={(event) => {
                  // Choosing must not blur the textarea first.
                  event.preventDefault();
                  chooseMention(person);
                }}
                // Deliberately mousemove, not mouseenter: the list opens under
                // wherever the cursor was left, and an idle mouse must not steal
                // the highlight from the keyboard.
                onMouseMove={() => setHighlighted(index)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px]",
                  index === highlighted ? "bg-accent" : "hover:bg-accent/60",
                )}
              >
                <UserAvatar user={person} size="xs" tooltip={false} />
                <span className="min-w-0 flex-1 truncate">{person.displayName}</span>
                {person.jobTitle && <span className="hidden truncate text-2xs text-muted-foreground sm:block">{person.jobTitle}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  children,
  testId,
  pressed,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  testId: string;
  pressed?: boolean;
}) {
  return (
    <SimpleTooltip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        data-testid={testId}
        onClick={onClick}
        className={cn(
          "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          pressed && "bg-accent text-foreground",
        )}
      >
        {children}
      </button>
    </SimpleTooltip>
  );
}
