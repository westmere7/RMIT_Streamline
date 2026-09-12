"use client";

import { Plus, X } from "lucide-react";
import * as React from "react";
import { ColorPicker } from "@/components/shared/color-picker";
import { ColorDot } from "@/components/shared/label-pill";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ColorToken, TagOption } from "@/domain";
import { cn } from "@/lib/utils";
import { slug } from "../booking-fields";

/**
 * The choices of a question, edited as what they will be.
 *
 * Chips when the form will show chips: the chip *is* the field — its words are
 * typed in place, its colour is the dot, and the cross takes it off. A list of
 * rows when the form will show a dropdown: those choices are sentences, and a
 * sentence in a pill wraps into a paragraph nobody can read.
 */

/** Colours handed to new choices in turn, so a fresh list is not all one shade. */
const NEXT_COLORS: readonly ColorToken[] = ["blue", "orange", "violet", "green", "sky", "amber", "teal", "pink", "rose", "cyan"];

export type ChoiceLayout = "chips" | "list";

export function ChoiceChips({ options, onChange, addLabel = "Add a choice", layout = "chips", testIdPrefix }: { options: TagOption[]; onChange: (next: TagOption[]) => void; addLabel?: string; layout?: ChoiceLayout; testIdPrefix?: string }) {
  /** Where the caret should go once a chip has been added; null when nothing is waiting. */
  const [focusAt, setFocusAt] = React.useState<number | null>(null);

  const patch = (index: number, option: Partial<TagOption>) => onChange(options.map((o, i) => (i === index ? { ...o, ...option } : o)));
  const remove = (index: number) => onChange(options.filter((_, i) => i !== index));
  const add = () => {
    onChange([...options, { name: "", color: NEXT_COLORS[options.length % NEXT_COLORS.length]! }]);
    setFocusAt(options.length);
  };
  const list = layout === "list";

  return (
    <div className={cn(list ? "grid gap-1" : "flex flex-wrap items-center gap-1.5")} data-testid={testIdPrefix} data-layout={layout}>
      {options.map((option, index) => (
        <Chip
          key={index}
          option={option}
          list={list}
          autoFocus={focusAt === index}
          onFocused={() => setFocusAt(null)}
          onName={(name) => patch(index, { name })}
          onColor={(color) => patch(index, { color })}
          onRemove={() => remove(index)}
          // Removing the last empty chip with Backspace is how a list is
          // shortened without reaching for the cross.
          onBackspaceEmpty={() => {
            remove(index);
            setFocusAt(index - 1);
          }}
          onEnter={add}
          testId={testIdPrefix ? `${testIdPrefix}-${slug(option.name) || index}` : undefined}
        />
      ))}
      <button
        type="button"
        onClick={add}
        className={cn(
          "inline-flex h-8 items-center gap-1 border border-dashed border-border text-[13px] text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground",
          list ? "w-full justify-start rounded-lg px-2.5" : "rounded-full px-2.5",
        )}
        data-testid={testIdPrefix ? `${testIdPrefix}-add` : undefined}
      >
        <Plus className="size-3.5" /> {addLabel}
      </button>
    </div>
  );
}

function Chip({
  option,
  list,
  autoFocus,
  onFocused,
  onName,
  onColor,
  onRemove,
  onBackspaceEmpty,
  onEnter,
  testId,
}: {
  option: TagOption;
  /** A full-width row rather than a pill. */
  list: boolean;
  autoFocus: boolean;
  onFocused: () => void;
  onName: (name: string) => void;
  onColor: (color: ColorToken) => void;
  onRemove: () => void;
  onBackspaceEmpty: () => void;
  onEnter: () => void;
  testId?: string;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (!autoFocus) return;
    input.current?.focus();
    onFocused();
  }, [autoFocus, onFocused]);

  return (
    <span className={cn("inline-flex h-8 items-center gap-1 border border-border bg-card pr-1 pl-2 text-[13px] transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20", list ? "w-full rounded-lg" : "rounded-full")}>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" aria-label={`Colour of “${option.name || "this choice"}”`} className="rounded-full p-0.5 transition-transform hover:scale-125">
            <ColorDot color={option.color} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-3">
          <ColorPicker value={option.color} onChange={(color) => onColor(color as ColorToken)} />
        </PopoverContent>
      </Popover>
      <input
        ref={input}
        value={option.name}
        onChange={(event) => onName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onEnter();
          }
          if (event.key === "Backspace" && option.name === "") {
            event.preventDefault();
            onBackspaceEmpty();
          }
        }}
        aria-label="Choice"
        placeholder={list ? "Write the choice out in full" : "Name it"}
        // A pill grows with its words. `size` is the fallback where a browser
        // has no content sizing; neither is exact, and a little wide is fine.
        // A row simply takes the width it is given.
        size={list ? undefined : Math.max(4, option.name.length)}
        className={cn("bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60", list ? "min-w-0 flex-1" : "min-w-12 [field-sizing:content]")}
        data-testid={testId}
      />
      <button type="button" aria-label={`Remove “${option.name || "this choice"}”`} onClick={onRemove} className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
        <X className="size-3" />
      </button>
    </span>
  );
}
