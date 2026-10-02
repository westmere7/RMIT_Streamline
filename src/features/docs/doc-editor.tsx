"use client";

import { Extension, generateJSON, type Editor, type JSONContent, type Range } from "@tiptap/core";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import { Bold, Code, Code2, Heading1, Heading2, Heading3, Italic, Link2, List, ListChecks, ListOrdered, Minus, Pilcrow, Quote, Strikethrough, Underline, type LucideIcon } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A doc's page: blocks you type into, as in a notebook. Markdown habits work
 * as you type ("# " for a heading, "- " for a list, "[] " for a to-do, "> " for
 * a quote, three backticks for code), "/" opens a menu of every kind of block,
 * and selecting text offers bold, italic and a link. Nothing more: no columns,
 * no databases, no embeds.
 *
 * The page is kept as the editor's own JSON, which only ever holds the blocks
 * and marks listed here: whatever is pasted or imported is read through this
 * schema, so a file cannot smuggle markup in.
 */

/** The blocks and marks a doc can hold: its schema, shared by the editor and by import. */
function schemaExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: "https", HTMLAttributes: { rel: "noreferrer noopener", target: "_blank" } },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
  ];
}

/** An imported file's HTML as a doc's page, keeping only what the schema allows. */
export function htmlToDocContent(html: string): JSONContent {
  return generateJSON(html, schemaExtensions());
}

interface BlockKind {
  key: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  /** Words it answers to in the "/" menu, besides its label. */
  keywords: string;
  run: (editor: Editor, range: Range) => void;
}

const BLOCKS: BlockKind[] = [
  { key: "text", label: "Text", hint: "Plain writing", icon: Pilcrow, keywords: "paragraph p", run: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run() },
  { key: "h1", label: "Heading 1", hint: "Big section title", icon: Heading1, keywords: "title h1 #", run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 1 }).run() },
  { key: "h2", label: "Heading 2", hint: "Medium title", icon: Heading2, keywords: "subtitle h2 ##", run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 2 }).run() },
  { key: "h3", label: "Heading 3", hint: "Small title", icon: Heading3, keywords: "h3 ###", run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 3 }).run() },
  { key: "bullets", label: "Bulleted list", hint: "A simple list", icon: List, keywords: "ul unordered -", run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
  { key: "numbers", label: "Numbered list", hint: "A list in order", icon: ListOrdered, keywords: "ol ordered 1.", run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
  { key: "todo", label: "To-do list", hint: "Things to tick off", icon: ListChecks, keywords: "task check checkbox []", run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run() },
  { key: "quote", label: "Quote", hint: "Set a passage apart", icon: Quote, keywords: "blockquote >", run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
  { key: "code", label: "Code", hint: "Monospaced block", icon: Code2, keywords: "codeblock pre ```", run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run() },
  { key: "divider", label: "Divider", hint: "A line across the page", icon: Minus, keywords: "hr rule line ---", run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },
];

function matchBlocks(query: string): BlockKind[] {
  const q = query.trim().toLowerCase();
  if (!q) return BLOCKS;
  return BLOCKS.filter((b) => b.label.toLowerCase().includes(q) || b.keywords.includes(q));
}

type SlashState = { items: BlockKind[]; command: (item: BlockKind) => void; rect: DOMRect | null } | null;

export interface DocEditorHandle {
  /** Replaces the page with this HTML (an imported file), read through the doc's schema. */
  replaceWithHtml: (html: string) => void;
  /** Adds this HTML to the end of the page. */
  appendHtml: (html: string) => void;
  /** Shows a newer copy saved elsewhere, without counting as an edit here. */
  setContent: (content: JSONContent | null) => void;
}

export const DocEditor = React.forwardRef<DocEditorHandle, { content: JSONContent | null; editable: boolean; onChange: (content: JSONContent) => void; className?: string }>(function DocEditor({ content, editable, onChange, className }, ref) {
  const [slash, setSlash] = React.useState<SlashState>(null);
  const [highlighted, setHighlighted] = React.useState(0);
  const slashRef = React.useRef<SlashState>(null);
  const highlightedRef = React.useRef(0);
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    slashRef.current = slash;
    highlightedRef.current = highlighted;
    onChangeRef.current = onChange;
  });

  const extensions = React.useMemo(
    () => [
      ...schemaExtensions(),
      Placeholder.configure({
        placeholder: ({ node, pos }) => (node.type.name === "heading" ? "Heading" : pos === 0 ? "Start writing, or type / for blocks" : "Type / for blocks"),
        showOnlyCurrent: true,
      }),
      Extension.create({
        name: "slashMenu",
        addProseMirrorPlugins() {
          return [
            Suggestion<BlockKind>({
              editor: this.editor,
              char: "/",
              startOfLine: false,
              items: ({ query }) => matchBlocks(query),
              command: ({ editor, range, props }) => props.run(editor, range),
              render: () => {
                const show = (props: SuggestionProps<BlockKind>) => {
                  setSlash({ items: props.items, command: props.command, rect: props.clientRect?.() ?? null });
                  setHighlighted(0);
                };
                return {
                  onStart: show,
                  onUpdate: show,
                  onExit: () => setSlash(null),
                  onKeyDown: ({ event }: SuggestionKeyDownProps) => {
                    const current = slashRef.current;
                    if (!current || current.items.length === 0) return false;
                    if (event.key === "ArrowDown") {
                      setHighlighted((i) => (i + 1) % current.items.length);
                      return true;
                    }
                    if (event.key === "ArrowUp") {
                      setHighlighted((i) => (i - 1 + current.items.length) % current.items.length);
                      return true;
                    }
                    if (event.key === "Enter" || event.key === "Tab") {
                      current.command(current.items[Math.min(highlightedRef.current, current.items.length - 1)]!);
                      return true;
                    }
                    if (event.key === "Escape") {
                      setSlash(null);
                      return true;
                    }
                    return false;
                  },
                };
              },
            }),
          ];
        },
      }),
    ],
    [],
  );

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions,
      editable,
      content: content ?? undefined,
      onUpdate: ({ editor }) => onChangeRef.current(editor.getJSON()),
      editorProps: {
        attributes: { class: "doc-prose min-h-[50vh] pb-32 focus:outline-none", "aria-label": "Doc", "data-testid": "doc-editor" },
      },
    },
    [extensions],
  );

  React.useEffect(() => {
    if (editor && !editor.isDestroyed) editor.setEditable(editable);
  }, [editor, editable]);

  React.useImperativeHandle(
    ref,
    () => ({
      replaceWithHtml: (html) => {
        if (!editor) return;
        editor.commands.setContent(html, { emitUpdate: true });
        editor.commands.focus("start");
      },
      appendHtml: (html) => {
        if (!editor) return;
        editor.chain().focus("end").insertContent(html).run();
      },
      setContent: (next) => {
        if (!editor || editor.isDestroyed) return;
        const { from, to } = editor.state.selection;
        editor.commands.setContent(next ?? "", { emitUpdate: false });
        // Keep the caret near where it was, as far as the new copy allows.
        const end = editor.state.doc.content.size;
        editor.commands.setTextSelection({ from: Math.min(from, end), to: Math.min(to, end) });
      },
    }),
    [editor],
  );

  return (
    <div className={cn("doc-editor relative", className)}>
      {editor && editable && <SelectionMenu editor={editor} />}
      <EditorContent editor={editor} />
      {slash && slash.items.length > 0 && slash.rect && (
        <div
          role="listbox"
          aria-label="Blocks"
          className="fixed z-50 w-64 rounded-xl border border-border/70 bg-popover p-1 text-popover-foreground shadow-lg"
          style={{ top: Math.min(slash.rect.bottom + 6, window.innerHeight - 340), left: Math.min(slash.rect.left, window.innerWidth - 270) }}
          data-testid="doc-slash-menu"
        >
          <p className="px-2 pt-1 pb-1 text-2xs font-medium text-muted-foreground">Blocks</p>
          <ul className="scrollbar-thin max-h-72 overflow-y-auto">
            {slash.items.map((item, i) => {
              const Icon = item.icon;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === highlighted}
                    onMouseEnter={() => setHighlighted(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      slash.command(item);
                    }}
                    className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left", i === highlighted && "bg-accent")}
                    data-testid={`doc-block-${item.key}`}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium">{item.label}</span>
                      <span className="block truncate text-2xs text-muted-foreground">{item.hint}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
});

/** What selected text can become: bold, italic, underline, struck, code, a link, or a heading. */
function SelectionMenu({ editor }: { editor: Editor }) {
  const [linking, setLinking] = React.useState(false);
  const [href, setHref] = React.useState("");
  // Read on every transaction, so the pressed buttons follow the selection.
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      link: e.isActive("link"),
    }),
  });
  const mark = (name: string, active: boolean, icon: LucideIcon, label: string, run: () => void) => {
    const Icon = icon;
    return (
      <button
        key={name}
        type="button"
        aria-label={label}
        aria-pressed={active}
        title={label}
        onMouseDown={(e) => e.preventDefault()}
        onClick={run}
        className={cn("flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground", active && "bg-accent text-foreground")}
      >
        <Icon className="size-3.5" />
      </button>
    );
  };
  const applyLink = () => {
    const url = href.trim();
    if (!url) editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: /^[a-z]+:/i.test(url) ? url : `https://${url}` }).run();
    setLinking(false);
  };
  return (
    <BubbleMenu editor={editor} options={{ placement: "top" }} shouldShow={({ editor: e, state }) => e.isEditable && !state.selection.empty && !e.isActive("codeBlock")}>
      <div className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-popover p-1 shadow-lg" data-testid="doc-selection-menu">
        {linking ? (
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              applyLink();
            }}
          >
            <input autoFocus value={href} onChange={(e) => setHref(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setLinking(false)} placeholder="Paste a link" aria-label="Link" className="h-7 w-56 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-ring" />
            <button type="submit" className="h-7 rounded-md px-2 text-xs font-medium hover:bg-accent">
              {href.trim() ? "Link" : "Remove"}
            </button>
          </form>
        ) : (
          <>
            {mark("h1", active.h1, Heading1, "Heading 1", () => editor.chain().focus().toggleHeading({ level: 1 }).run())}
            {mark("h2", active.h2, Heading2, "Heading 2", () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
            <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
            {mark("bold", active.bold, Bold, "Bold", () => editor.chain().focus().toggleBold().run())}
            {mark("italic", active.italic, Italic, "Italic", () => editor.chain().focus().toggleItalic().run())}
            {mark("underline", active.underline, Underline, "Underline", () => editor.chain().focus().toggleUnderline().run())}
            {mark("strike", active.strike, Strikethrough, "Strikethrough", () => editor.chain().focus().toggleStrike().run())}
            {mark("code", active.code, Code, "Code", () => editor.chain().focus().toggleCode().run())}
            <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
            {mark("link", active.link, Link2, "Link", () => {
              setHref((editor.getAttributes("link").href as string | undefined) ?? "");
              setLinking(true);
            })}
          </>
        )}
      </div>
    </BubbleMenu>
  );
}
