"use client";

import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Links take http(s) and mailto; images must be https so mail clients can load them. */
export function normalizeUrl(input: string, kind: "link" | "image"): string | null {
  const value = input.trim();
  if (!value) return null;
  if (kind === "link" && /^mailto:[^\s@]+@[^\s@]+$/i.test(value)) return value;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (kind === "image") return url.protocol === "https:" ? url.toString() : null;
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      // Keep the selection in the editor when the button is pressed.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(active && "bg-accent-soft text-ink hover:bg-accent-soft")}
    >
      {children}
    </Button>
  );
}

function Toolbar({ editor, disabled }: { editor: Editor; disabled?: boolean }) {
  const [urlMode, setUrlMode] = useState<"link" | "image" | null>(null);
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      link: e.isActive("link"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
    }),
  });

  function openUrl(mode: "link" | "image") {
    setUrlError(null);
    setUrl(
      mode === "link" ? ((editor.getAttributes("link").href as string | undefined) ?? "") : "",
    );
    setUrlMode(mode);
  }

  function applyUrl() {
    if (!urlMode) return;
    const normalized = normalizeUrl(url, urlMode);
    if (!normalized) {
      setUrlError(
        urlMode === "image"
          ? "Use an https:// image address."
          : "Enter a web address, like https://example.com.",
      );
      return;
    }
    if (urlMode === "link") {
      editor.chain().focus().extendMarkRange("link").setLink({ href: normalized }).run();
    } else {
      editor.chain().focus().setImage({ src: normalized }).run();
    }
    setUrlMode(null);
  }

  return (
    <div className="grid gap-2">
      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5">
        <ToolbarButton
          label="Bold"
          active={state.bold}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={state.italic}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Link"
          active={state.link}
          disabled={disabled}
          onClick={() => openUrl("link")}
        >
          <LinkIcon aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Bulleted list"
          active={state.bullet}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={state.ordered}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Quote"
          active={state.quote}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Image by address"
          disabled={disabled}
          onClick={() => openUrl("image")}
        >
          <ImageIcon aria-hidden />
        </ToolbarButton>
      </div>
      {urlMode ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            applyUrl();
          }}
        >
          <Input
            autoFocus
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder={
              urlMode === "link" ? "https://example.com" : "https://example.com/logo.png"
            }
            aria-label={urlMode === "link" ? "Link address" : "Image address"}
            aria-invalid={!!urlError}
            className="h-8 min-w-0 flex-1 basis-56"
          />
          <Button type="submit" size="sm" className="font-bold">
            {urlMode === "link" ? "Apply link" : "Insert image"}
          </Button>
          {urlMode === "link" && state.link ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                editor.chain().focus().extendMarkRange("link").unsetLink().run();
                setUrlMode(null);
              }}
            >
              Remove link
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="ghost" onClick={() => setUrlMode(null)}>
            Cancel
          </Button>
          {urlError ? (
            <p role="alert" className="basis-full text-xs text-danger-ink">
              {urlError}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

/** TipTap rich text. Remount (change `key`) to load different content. */
export default function RichEditor({
  initialHtml,
  onChange,
  disabled,
  placeholder = "Write your message",
}: {
  initialHtml: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    content: initialHtml,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
      }),
      Image.configure({ allowBase64: false }),
      Placeholder.configure({ placeholder }),
    ],
    editorProps: {
      attributes: {
        "aria-label": "Message body",
        role: "textbox",
        "aria-multiline": "true",
        class: "min-h-40 outline-none",
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? "" : e.getHTML()),
  });

  if (!editor) return <div className="min-h-40" aria-busy />;
  return (
    <div className="grid gap-3">
      <Toolbar editor={editor} disabled={disabled} />
      <EditorContent
        editor={editor}
        className={cn(
          "text-[0.9375rem] leading-relaxed",
          "[&_.tiptap_p]:my-0 [&_.tiptap_p+p]:mt-3",
          "[&_.tiptap_ol]:my-2 [&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-6 [&_.tiptap_ul]:my-2 [&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-6",
          "[&_.tiptap_blockquote]:my-2 [&_.tiptap_blockquote]:border-l-[3px] [&_.tiptap_blockquote]:border-line-strong [&_.tiptap_blockquote]:pl-3 [&_.tiptap_blockquote]:text-ink-secondary",
          "[&_.tiptap_a]:text-accent-hover [&_.tiptap_a]:underline [&_.tiptap_img]:my-2 [&_.tiptap_img]:h-auto [&_.tiptap_img]:max-w-full [&_.tiptap_img]:rounded-md",
          "[&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none [&_.tiptap_p.is-editor-empty:first-child::before]:float-left [&_.tiptap_p.is-editor-empty:first-child::before]:h-0 [&_.tiptap_p.is-editor-empty:first-child::before]:text-ink-faint [&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
        )}
      />
    </div>
  );
}
