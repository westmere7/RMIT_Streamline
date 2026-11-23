"use client";

import { Extension } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Check, Italic, Link2, Trash2, Underline } from "lucide-react";
import * as React from "react";
import { INLINE_LINK_CLASS } from "@/components/shared/inline-rich-text";
import { normalizeLinkHref } from "@/lib/rich-text";
import { docToInlineText, inlineTextToDoc } from "@/lib/rich-text-doc";
import { cn } from "@/lib/utils";

/**
 * A form editor box that takes a little formatting: bold, italic, underline
 * and a link. Nothing on the box says so. Selecting words — or right-clicking
 * one — brings up four buttons over the selection, and that is all.
 *
 * It looks and sizes like the plain TextBox beside it and stores the same small
 * markup the rest of the app writes (`**bold**`, `*italic*`, `__underline__`,
 * `[words](https://…)`), so the form renders it with `InlineRichText`.
 */
export function FormattingTextBox({
  value,
  onChange,
  ariaLabel,
  placeholder,
  className,
  testId,
  multiline,
  rows,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  testId?: string;
  multiline?: boolean;
  rows?: number;
}) {
  const onChangeRef = React.useRef(onChange);
  React.useLayoutEffect(() => {
    onChangeRef.current = onChange;
  });

  const extensions = React.useMemo(
    () => [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        hardBreak: false,
        dropcursor: false,
        gapcursor: false,
        trailingNode: false,
        link: {
          openOnClick: false,
          // Only a link someone made: "timeline.So" at the end of a sentence is not an address.
          autolink: false,
          linkOnPaste: true,
          defaultProtocol: "https",
          HTMLAttributes: { rel: "noreferrer noopener", target: "_blank", class: INLINE_LINK_CLASS },
        },
      }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      // A one-line box stays one line: Enter does nothing.
      ...(multiline ? [] : [Extension.create({ name: "singleLine", addKeyboardShortcuts: () => ({ Enter: () => true, "Shift-Enter": () => true }) })]),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fixed for the life of the box
    [],
  );

  const write = (editor: Editor) => {
    const text = docToInlineText(editor.getJSON());
    onChangeRef.current(multiline ? text : text.replace(/\s*\n+\s*/g, " "));
  };

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions,
      content: inlineTextToDoc(value),
      onUpdate: ({ editor }) => write(editor),
      editorProps: {
        attributes: {
          class: cn(
            "block w-full whitespace-pre-wrap break-words rounded-md border border-border/50 bg-transparent px-2 py-1 text-inherit outline-none transition-colors focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/20 [&_p]:m-0",
            className,
          ),
          style: multiline ? `min-height: ${(rows ?? 2) * 1.5 + 0.6}em` : "",
          role: "textbox",
          "aria-multiline": multiline ? "true" : "false",
          "aria-label": ariaLabel,
          ...(testId ? { "data-testid": testId } : {}),
        },
      },
    },
    [extensions],
  );

  // A value changed from outside (a saved form loaded, an undo): show it.
  React.useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (docToInlineText(editor.getJSON()) === value) return;
    editor.commands.setContent(inlineTextToDoc(value), { emitUpdate: false });
  }, [editor, value]);

  /** Right-click on a word with nothing selected: select the word, so the buttons come up for it. */
  const onContextMenu = (event: React.MouseEvent) => {
    if (!editor) return;
    if (!editor.state.selection.empty) {
      event.preventDefault();
      return;
    }
    const at = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
    if (!at) return;
    const $pos = editor.state.doc.resolve(at.pos);
    const text = $pos.parent.textContent;
    const offset = $pos.parentOffset;
    let start = offset;
    let end = offset;
    while (start > 0 && /\S/.test(text[start - 1]!)) start--;
    while (end < text.length && /\S/.test(text[end]!)) end++;
    if (start === end) return;
    event.preventDefault();
    const base = at.pos - offset;
    editor.chain().focus().setTextSelection({ from: base + start, to: base + end }).run();
  };

  return (
    <div className="form-text-box relative min-w-0 flex-1" onContextMenu={onContextMenu}>
      <EditorContent editor={editor} />
      {editor && <FormatBubble editor={editor} />}
    </div>
  );
}

function FormatBubble({ editor }: { editor: Editor }) {
  const [linking, setLinking] = React.useState(false);
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      link: e.isActive("link"),
      href: (e.getAttributes("link").href as string | undefined) ?? "",
    }),
  });
  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top", offset: 6 }}
      className="z-50 flex items-center gap-0.5 rounded-lg border border-border bg-popover p-0.5 text-popover-foreground shadow-md"
      data-testid="format-bubble"
    >
      {linking ? (
        <LinkField editor={editor} existing={state.href} onDone={() => setLinking(false)} />
      ) : (
        <>
          <BubbleButton label="Bold" pressed={state.bold} onClick={() => editor.chain().focus().toggleBold().run()} testId="format-bold">
            <Bold className="size-3.5" />
          </BubbleButton>
          <BubbleButton label="Italic" pressed={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()} testId="format-italic">
            <Italic className="size-3.5" />
          </BubbleButton>
          <BubbleButton label="Underline" pressed={state.underline} onClick={() => editor.chain().focus().toggleUnderline().run()} testId="format-underline">
            <Underline className="size-3.5" />
          </BubbleButton>
          <BubbleButton label={state.link ? "Edit link" : "Link"} pressed={state.link} onClick={() => setLinking(true)} testId="format-link">
            <Link2 className="size-3.5" />
          </BubbleButton>
        </>
      )}
    </BubbleMenu>
  );
}

/** The address box that takes the bubble's place while a link is being made. */
function LinkField({ editor, existing, onDone }: { editor: Editor; existing: string; onDone: () => void }) {
  const [href, setHref] = React.useState(existing);
  const [invalid, setInvalid] = React.useState(false);
  const apply = () => {
    const normalized = normalizeLinkHref(href);
    if (!normalized) {
      setInvalid(true);
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: normalized }).run();
    onDone();
  };
  return (
    <div className="flex items-center gap-0.5" data-testid="format-link-field">
      <input
        autoFocus
        value={href}
        onChange={(event) => {
          setHref(event.target.value);
          setInvalid(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            apply();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onDone();
            editor.commands.focus();
          }
        }}
        placeholder="https://"
        aria-label="Link address"
        aria-invalid={invalid || undefined}
        spellCheck={false}
        className={cn("h-7 w-52 rounded-md bg-transparent px-2 text-xs outline-none", invalid && "text-destructive")}
        data-testid="format-link-href"
      />
      <BubbleButton label="Apply link" onClick={apply} testId="format-link-apply">
        <Check className="size-3.5" />
      </BubbleButton>
      {existing && (
        <BubbleButton
          label="Remove link"
          onClick={() => {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            onDone();
          }}
          testId="format-link-remove"
        >
          <Trash2 className="size-3.5" />
        </BubbleButton>
      )}
    </div>
  );
}

function BubbleButton({ label, pressed, onClick, children, testId }: { label: string; pressed?: boolean; onClick: () => void; children: React.ReactNode; testId: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      // Keep the selection: a button that took focus would collapse it first.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn("flex size-7 items-center justify-center rounded-md transition-colors hover:bg-accent", pressed ? "bg-accent text-foreground" : "text-muted-foreground")}
      data-testid={testId}
    >
      {children}
    </button>
  );
}
