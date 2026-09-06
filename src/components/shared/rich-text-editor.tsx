"use client";

import { Extension, getMarkRange, Mark, mergeAttributes } from "@tiptap/core";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { Bold, ExternalLink, Heading1, Heading2, Italic, Link2, List, ListOrdered, Palette, Pencil, Trash2 } from "lucide-react";
import * as React from "react";
import { RICH_TEXT_COLOR_CLASSES } from "@/components/shared/rich-text";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { SimpleTooltip } from "@/components/ui/tooltip";
import type { User } from "@/domain";
import { normalizeLinkHref, RICH_TEXT_COLORS, type RichTextColor } from "@/lib/rich-text";
import { docToRichText, richTextToDoc } from "@/lib/rich-text-doc";
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

const MENTION_CLASS = "rounded bg-blue-50 px-1 font-medium text-blue-700 dark:bg-navy-500/40 dark:text-navy-100";

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

/** Text colour from the fixed palette, stored as {c:red}…{/c}. */
const TextColor = Mark.create({
  name: "textColor",
  addAttributes() {
    return {
      color: {
        default: "grey",
        parseHTML: (element) => element.getAttribute("data-color"),
        renderHTML: (attributes) => {
          const color = attributes.color as RichTextColor;
          return { "data-color": color, class: RICH_TEXT_COLOR_CLASSES[color] ?? RICH_TEXT_COLOR_CLASSES.grey };
        },
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-color]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },
});

/** Ranks people for the "@" picker: a name that starts with what was typed comes first. */
function rankPeople(people: readonly User[], rawQuery: string): User[] {
  const query = rawQuery.toLowerCase().trim();
  const active = people.filter((person) => person.deactivatedAt === null);
  if (!query) return active.slice(0, 6);
  // Someone typing "@jun" means Jun, not the Junior Designer: a name that
  // starts with what was typed comes first, then any other name, and only
  // then a job title that happens to contain it.
  const rank = (person: User): number => {
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
}

type MentionState = { items: User[]; command: (attrs: { id: string; label: string }) => void };
type LinkCardState = { href: string; from: number; to: number; left: number; top: number };

/**
 * The update composer: a small WYSIWYG editor. Bold shows as bold while you
 * type, lists are real lists, links are underlined, and a name picker appears
 * as soon as you type "@". What is stored is still the plain markup that
 * ./rich-text.ts reads, so nothing about posted updates changes.
 */
export function RichTextEditor({ value, onChange, onSubmit, people, placeholder, rows = 3, ariaLabel, testId, autoFocus, className }: RichTextEditorProps) {
  const [mention, setMention] = React.useState<MentionState | null>(null);
  const [highlighted, setHighlighted] = React.useState(0);
  const [colorsOpen, setColorsOpen] = React.useState(false);
  const [linkOpen, setLinkOpen] = React.useState(false);

  // The extensions are created once, so anything they call goes through a ref.
  const onSubmitRef = React.useRef(onSubmit);
  const peopleRef = React.useRef(people);
  const mentionRef = React.useRef<MentionState | null>(null);
  const highlightedRef = React.useRef(0);
  const dismissedRef = React.useRef(false);
  const mentionNames = React.useMemo(() => people.map((person) => person.displayName), [people]);
  const namesRef = React.useRef(mentionNames);
  React.useLayoutEffect(() => {
    onSubmitRef.current = onSubmit;
    peopleRef.current = people;
    mentionRef.current = mention;
    highlightedRef.current = highlighted;
    namesRef.current = mentionNames;
  });

  const extensions = React.useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2] },
        hardBreak: false,
        blockquote: false,
        code: false,
        codeBlock: false,
        strike: false,
        underline: false,
        horizontalRule: false,
        dropcursor: false,
        gapcursor: false,
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          defaultProtocol: "https",
          HTMLAttributes: { rel: "noreferrer noopener", target: "_blank" },
        },
      }),
      TextColor,
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      Extension.create({
        name: "submitShortcut",
        addKeyboardShortcuts() {
          return {
            "Mod-Enter": () => {
              onSubmitRef.current?.();
              return true;
            },
          };
        },
      }),
      // eslint-disable-next-line react-hooks/refs -- the refs are only read inside editor event callbacks, never during render
      Mention.configure({
        HTMLAttributes: { class: MENTION_CLASS, "data-testid": "mention" },
        renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id}`,
        deleteTriggerWithBackspace: true,
        suggestion: {
          char: "@",
          allowSpaces: true,
          items: ({ query }) => rankPeople(peopleRef.current, query),
          render: () => {
            const show = (props: SuggestionProps<User>) => {
              if (dismissedRef.current) return;
              setMention({ items: props.items, command: props.command });
              setHighlighted(0);
            };
            return {
              onStart: (props) => {
                dismissedRef.current = false;
                show(props);
              },
              onUpdate: show,
              onExit: () => {
                dismissedRef.current = false;
                setMention(null);
              },
              onKeyDown: ({ event }: SuggestionKeyDownProps) => {
                const current = mentionRef.current;
                if (!current || current.items.length === 0) return false;
                if (event.key === "ArrowDown") {
                  setHighlighted((index) => (index + 1) % current.items.length);
                  return true;
                }
                if (event.key === "ArrowUp") {
                  setHighlighted((index) => (index - 1 + current.items.length) % current.items.length);
                  return true;
                }
                if (event.key === "Enter" || event.key === "Tab") {
                  const person = current.items[Math.min(highlightedRef.current, current.items.length - 1)]!;
                  current.command({ id: person.id, label: person.displayName });
                  return true;
                }
                if (event.key === "Escape") {
                  dismissedRef.current = true;
                  setMention(null);
                  return true;
                }
                return false;
              },
            };
          },
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- placeholder is fixed for the life of a composer
    [],
  );

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions,
      content: richTextToDoc(value, mentionNames),
      autofocus: autoFocus ? "end" : false,
      onUpdate: ({ editor }) => onChange(docToRichText(editor.getJSON())),
      editorProps: {
        attributes: {
          class: "min-h-16 w-full px-3 py-2.5 text-[13px] focus:outline-none",
          style: `min-height: ${rows * 1.5 + 1.25}rem`,
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": ariaLabel,
          ...(testId ? { "data-testid": testId } : {}),
        },
      },
    },
    [extensions],
  );

  // When the value is changed from outside (cleared after posting, say), show it.
  React.useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (docToRichText(editor.getJSON()) === value) return;
    editor.commands.setContent(richTextToDoc(value, namesRef.current), { emitUpdate: false });
  }, [editor, value]);

  const EMPTY_STATE = { bold: false, italic: false, h1: false, h2: false, bullets: false, numbers: false, link: false, color: null as RichTextColor | null };
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold") ?? false,
      italic: e?.isActive("italic") ?? false,
      h1: e?.isActive("heading", { level: 1 }) ?? false,
      h2: e?.isActive("heading", { level: 2 }) ?? false,
      bullets: e?.isActive("bulletList") ?? false,
      numbers: e?.isActive("orderedList") ?? false,
      link: e?.isActive("link") ?? false,
      color: (e?.getAttributes("textColor").color as RichTextColor | undefined) ?? null,
    }),
  }) ?? EMPTY_STATE;

  // A small card under whichever link the caret is in or the mouse is over,
  // offering to edit or remove it.
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [linkCard, setLinkCard] = React.useState<LinkCardState | null>(null);
  const hoveringRef = React.useRef(false);

  const cardFor = React.useCallback(
    (from: number, to: number): LinkCardState | null => {
      const box = contentRef.current?.getBoundingClientRect();
      if (!editor || !box) return null;
      const href = String(editor.state.doc.rangeHasMark(from, to, editor.schema.marks.link!) ? (editor.state.doc.resolve(from + 1).marks().find((m) => m.type.name === "link")?.attrs.href ?? "") : "");
      if (!href) return null;
      const start = editor.view.coordsAtPos(from);
      const end = editor.view.coordsAtPos(to);
      return { href, from, to, left: Math.max(0, start.left - box.left), top: end.bottom - box.top + 4 };
    },
    [editor],
  );

  // Caret moves into or out of a link.
  React.useEffect(() => {
    if (!editor) return;
    const sync = () => {
      if (hoveringRef.current) return;
      const linkType = editor.schema.marks.link!;
      const range = getMarkRange(editor.state.selection.$from, linkType);
      setLinkCard(range && editor.isActive("link") ? cardFor(range.from, range.to) : null);
    };
    editor.on("selectionUpdate", sync);
    editor.on("transaction", sync);
    return () => {
      editor.off("selectionUpdate", sync);
      editor.off("transaction", sync);
    };
  }, [editor, cardFor]);

  const onContentMouseOver = (event: React.MouseEvent) => {
    if (!editor) return;
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor || !contentRef.current?.contains(anchor)) return;
    const pos = editor.view.posAtDOM(anchor, 0);
    const $pos = editor.state.doc.resolve(Math.min(pos + 1, editor.state.doc.content.size));
    const range = getMarkRange($pos, editor.schema.marks.link!);
    if (!range) return;
    hoveringRef.current = true;
    setLinkCard(cardFor(range.from, range.to));
  };

  const onContentMouseLeave = () => {
    hoveringRef.current = false;
    if (!editor?.isActive("link")) setLinkCard(null);
  };

  const editLink = () => {
    if (!editor || !linkCard) return;
    editor.chain().focus().setTextSelection({ from: linkCard.from, to: linkCard.to }).run();
    setLinkOpen(true);
  };

  const removeLink = () => {
    if (!editor || !linkCard) return;
    editor.chain().focus().setTextSelection({ from: linkCard.from, to: linkCard.to }).unsetLink().run();
    hoveringRef.current = false;
    setLinkCard(null);
  };

  const chooseMention = (person: User) => {
    mention?.command({ id: person.id, label: person.displayName });
    setMention(null);
  };

  return (
    <div className={cn("rich-text-editor relative", className)}>
      <div className="overflow-hidden rounded-lg border border-border bg-card transition-[border-color,box-shadow] duration-150 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border/60 bg-surface/50 px-1.5 py-1" role="toolbar" aria-label="Formatting">
        <ToolButton label="Bold" pressed={state.bold} onClick={() => editor?.chain().focus().toggleBold().run()} testId="format-bold">
          <Bold className="size-3.5" />
        </ToolButton>
        <ToolButton label="Italic" pressed={state.italic} onClick={() => editor?.chain().focus().toggleItalic().run()} testId="format-italic">
          <Italic className="size-3.5" />
        </ToolButton>
        <ToolButton label="Large text" pressed={state.h1} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} testId="format-h1">
          <Heading1 className="size-3.5" />
        </ToolButton>
        <ToolButton label="Medium text" pressed={state.h2} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} testId="format-h2">
          <Heading2 className="size-3.5" />
        </ToolButton>
        <span aria-hidden className="mx-0.5 h-4 w-px bg-border/70" />
        <ToolButton label="Bulleted list" pressed={state.bullets} onClick={() => editor?.chain().focus().toggleBulletList().run()} testId="format-bullets">
          <List className="size-3.5" />
        </ToolButton>
        <ToolButton label="Numbered list" pressed={state.numbers} onClick={() => editor?.chain().focus().toggleOrderedList().run()} testId="format-numbers">
          <ListOrdered className="size-3.5" />
        </ToolButton>
        <Popover open={linkOpen} onOpenChange={setLinkOpen}>
          <PopoverAnchor asChild>
            <span className="inline-flex">
              <ToolButton label="Link" pressed={state.link || linkOpen} onClick={() => setLinkOpen((open) => !open)} testId="format-link">
                <Link2 className="size-3.5" />
              </ToolButton>
            </span>
          </PopoverAnchor>
          {editor && linkOpen && <LinkPopover editor={editor} onClose={() => setLinkOpen(false)} />}
        </Popover>
        <span aria-hidden className="mx-0.5 h-4 w-px bg-border/70" />
        <div className="relative">
          <ToolButton label="Colour" onClick={() => setColorsOpen((open) => !open)} testId="format-color" pressed={colorsOpen || !!state.color}>
            <Palette className="size-3.5" />
          </ToolButton>
          {colorsOpen && (
            <div className="absolute top-full left-0 z-20 mt-1 flex items-center gap-1 rounded-lg border border-border/70 bg-popover p-1.5 shadow-lg" data-testid="color-palette">
              {RICH_TEXT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={color}
                  aria-pressed={state.color === color}
                  data-testid={`color-${color}`}
                  onClick={() => {
                    setColorsOpen(false);
                    editor?.chain().focus().setMark("textColor", { color }).run();
                  }}
                  className={cn(
                    "size-4 rounded-full ring-offset-1 ring-offset-popover transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-ring",
                    SWATCHES[color],
                    state.color === color && "ring-2 ring-ring",
                  )}
                />
              ))}
              <button
                type="button"
                aria-label="No colour"
                data-testid="color-none"
                onClick={() => {
                  setColorsOpen(false);
                  editor?.chain().focus().unsetMark("textColor").run();
                }}
                className="size-4 rounded-full border border-border bg-transparent transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-ring"
              />
            </div>
          )}
        </div>
      </div>

      <div ref={contentRef} className="relative" onMouseOver={onContentMouseOver} onMouseLeave={onContentMouseLeave}>
        <EditorContent editor={editor} />
        {linkCard && !linkOpen && (
          <div
            role="group"
            aria-label="Link"
            data-testid="link-card"
            style={{ left: linkCard.left, top: linkCard.top }}
            className="absolute z-30 flex max-w-72 items-center gap-1 rounded-lg border border-border/70 bg-popover p-1 text-2xs shadow-lg"
          >
            <a
              href={linkCard.href}
              target="_blank"
              rel="noreferrer noopener"
              className="flex min-w-0 items-center gap-1 rounded px-1.5 py-1 text-ring hover:bg-accent"
              title={linkCard.href}
            >
              <ExternalLink className="size-3 shrink-0" />
              <span className="truncate">{linkCard.href.replace(/^https?:\/\//, "")}</span>
            </a>
            <span aria-hidden className="h-4 w-px bg-border/70" />
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={editLink} data-testid="link-card-edit" className="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-accent">
              <Pencil className="size-3" /> Edit
            </button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={removeLink} data-testid="link-card-remove" className="flex items-center gap-1 rounded px-1.5 py-1 text-destructive hover:bg-accent">
              <Trash2 className="size-3" /> Remove
            </button>
          </div>
        )}
      </div>
      </div>

      {mention && mention.items.length > 0 && (
        <ul
          className="absolute right-0 bottom-full left-0 z-30 mb-1 max-h-56 overflow-y-auto rounded-xl border border-border/70 bg-popover p-1 shadow-lg"
          role="listbox"
          aria-label="People to mention"
          data-testid="mention-list"
        >
          {mention.items.map((person, index) => (
            <li key={person.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlighted}
                onMouseDown={(event) => {
                  // Choosing must not blur the editor first.
                  event.preventDefault();
                  chooseMention(person);
                }}
                // Deliberately mousemove, not mouseenter: the list opens under
                // wherever the cursor was left, and an idle mouse must not steal
                // the highlight from the keyboard.
                onMouseMove={() => setHighlighted(index)}
                className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px]", index === highlighted ? "bg-accent" : "hover:bg-accent/60")}
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

/**
 * The small window the Link button opens. It checks the address is a real
 * web or mail address before anything is inserted, and can take a link off.
 */
function LinkPopover({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const existingHref = (editor.getAttributes("link").href as string | undefined) ?? "";
  const { from, to, empty } = editor.state.selection;
  const selectedText = empty ? "" : editor.state.doc.textBetween(from, to, " ");
  const needsLabel = empty && !existingHref;

  const [href, setHref] = React.useState(existingHref);
  const [label, setLabel] = React.useState(selectedText);
  const [touched, setTouched] = React.useState(false);

  const normalized = normalizeLinkHref(href);
  const invalid = normalized === null;
  // Only complain once the person has finished with the field or tried to
  // apply; a half-typed address is not a mistake yet.
  const showError = invalid && touched;

  const apply = () => {
    setTouched(true);
    if (!normalized) return;
    const chain = editor.chain().focus();
    if (existingHref || !empty) {
      chain.extendMarkRange("link").setLink({ href: normalized }).run();
    } else {
      const text = label.trim() || normalized;
      // The space after the link is a plain text node, so typing on continues outside the link.
      chain
        .insertContent([
          { type: "text", text, marks: [{ type: "link", attrs: { href: normalized } }] },
          { type: "text", text: " " },
        ])
        .run();
    }
    onClose();
  };

  const remove = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    onClose();
  };

  return (
    <PopoverContent
      align="start"
      className="w-72 p-3"
      data-testid="link-popover"
      onOpenAutoFocus={(event) => {
        // Put the caret in the address field straight away.
        event.preventDefault();
        (event.currentTarget as HTMLElement | null)?.querySelector<HTMLInputElement>("[data-testid=link-href]")?.focus();
      }}
    >
      {/* Not a <form>: the composer around the editor is one already, and a
          submit bubbling up through the portal would post the update instead. */}
      <div
        className="space-y-2.5"
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          event.stopPropagation();
          apply();
        }}
      >
        <div className="grid gap-1">
          <Label htmlFor="link-href" className="text-2xs">
            Address
          </Label>
          <Input
            id="link-href"
            value={href}
            onChange={(event) => setHref(event.target.value)}
            onBlur={() => href.trim() && setTouched(true)}
            placeholder="https://example.com"
            aria-invalid={showError ? true : undefined}
            className="h-8 text-[13px]"
            data-testid="link-href"
            autoComplete="off"
            spellCheck={false}
          />
          {showError ? (
            <p className="text-2xs text-destructive" role="alert" data-testid="link-error">
              {href.trim() ? "That is not a web address. Try something like https://example.com" : "Enter a web address such as https://example.com"}
            </p>
          ) : normalized && normalized !== href.trim() ? (
            <p className="text-2xs text-muted-foreground">Will link to {normalized}</p>
          ) : null}
        </div>
        {needsLabel && (
          <div className="grid gap-1">
            <Label htmlFor="link-label" className="text-2xs">
              Text to show
            </Label>
            <Input id="link-label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Optional" className="h-8 text-[13px]" data-testid="link-label" />
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          {existingHref ? (
            <Button type="button" variant="ghost" size="sm" onClick={remove} data-testid="link-remove">
              <Trash2 /> Remove
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={apply} data-testid="link-apply">
              {existingHref ? "Save" : "Add link"}
            </Button>
          </div>
        </div>
      </div>
    </PopoverContent>
  );
}

function ToolButton({ label, onClick, children, testId, pressed }: { label: string; onClick: () => void; children: React.ReactNode; testId: string; pressed?: boolean }) {
  return (
    <SimpleTooltip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        data-testid={testId}
        // mousedown, not click, so the editor's selection is not lost first.
        onMouseDown={(event) => {
          event.preventDefault();
          onClick();
        }}
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
