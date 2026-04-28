import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { cn } from "@/lib/utils";
import { 
  Bold, 
  Italic, 
  List, 
  ListOrdered, 
  Quote, 
  Heading1, 
  Heading2, 
  Undo, 
  Redo, 
  Link as LinkIcon,
  Strikethrough
} from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

const MenuButton = ({ 
  onClick, 
  isActive = false, 
  disabled = false, 
  children 
}: { 
  onClick: () => void; 
  isActive?: boolean; 
  disabled?: boolean;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={(e) => {
      e.preventDefault();
      onClick();
    }}
    disabled={disabled}
    className={cn(
      "p-1.5 rounded-md transition-colors",
      isActive 
        ? "bg-blue-100 text-blue-600" 
        : "text-slate-600 hover:bg-slate-100 disabled:opacity-30"
    )}
  >
    {children}
  </button>
);

export default function RichTextEditor({ value, onChange, className, placeholder }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
      }),
      Placeholder.configure({
        placeholder: placeholder || 'Опишите детали...',
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm max-w-none focus:outline-none min-h-[150px] px-4 py-3 text-sm text-slate-700",
          "placeholder:text-slate-400"
        ),
      },
    },
  });

  if (!editor) {
    return null;
  }

  return (
    <div className={cn("bg-white rounded-2xl overflow-hidden border border-slate-200 flex flex-col", className)}>
      <div className="flex flex-wrap items-center gap-0.5 p-1 bg-slate-50 border-bottom border-slate-200">
        <MenuButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
        >
          <Bold size={16} />
        </MenuButton>
        <MenuButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
        >
          <Italic size={16} />
        </MenuButton>
        <MenuButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive('strike')}
        >
          <Strikethrough size={16} />
        </MenuButton>
        
        <div className="w-px h-4 bg-slate-200 mx-1" />

        <MenuButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive('heading', { level: 1 })}
        >
          <Heading1 size={16} />
        </MenuButton>
        <MenuButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive('heading', { level: 2 })}
        >
          <Heading2 size={16} />
        </MenuButton>

        <div className="w-px h-4 bg-slate-200 mx-1" />

        <MenuButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
        >
          <List size={16} />
        </MenuButton>
        <MenuButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
        >
          <ListOrdered size={16} />
        </MenuButton>
        <MenuButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive('blockquote')}
        >
          <Quote size={16} />
        </MenuButton>

        <div className="w-px h-4 bg-slate-200 mx-1" />

        <MenuButton
          onClick={() => {
            const url = window.prompt('URL');
            if (url) {
              editor.chain().focus().setLink({ href: url }).run();
            }
          }}
          isActive={editor.isActive('link')}
        >
          <LinkIcon size={16} />
        </MenuButton>

        <div className="flex-1" />

        <MenuButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        >
          <Undo size={16} />
        </MenuButton>
        <MenuButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        >
          <Redo size={16} />
        </MenuButton>
      </div>

      <EditorContent editor={editor} />
      
      <style>{`
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #94a3b8;
          pointer-events: none;
          height: 0;
        }
        .ProseMirror ul {
          list-style-type: disc;
          padding-left: 1.5rem;
        }
        .ProseMirror ol {
          list-style-type: decimal;
          padding-left: 1.5rem;
        }
        .ProseMirror blockquote {
          border-left: 3px solid #e2e8f0;
          padding-left: 1rem;
          font-style: italic;
          color: #64748b;
        }
      `}</style>
    </div>
  );
}
