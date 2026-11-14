import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { useState, useCallback, useEffect } from 'react';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Link as LinkIcon,
  Unlink,
  Heading1,
  Heading2,
  Pilcrow,
  RemoveFormatting,
  Eye,
  Edit3,
  Code } from
'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string, text: string) => void;
  placeholder?: string;
  error?: boolean;
}

export default function RichTextEditor({ value, onChange, placeholder, error }: RichTextEditorProps) {
  const [mode, setMode] = useState<'wysiwyg' | 'source' | 'preview'>('wysiwyg');
  const [sourceHtml, setSourceHtml] = useState(value);
  const [linkUrl, setLinkUrl] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);

  const editor = useEditor({
    extensions: [
    StarterKit.configure({
      heading: {
        levels: [1, 2]
      }
    }),
    Underline,
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        rel: 'noopener noreferrer',
        target: '_blank'
      }
    })],

    content: value,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const text = editor.getText();
      setSourceHtml(html);
      onChange(html, text);
    },
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none min-h-[200px] px-4 py-3'
      }
    }
  });

  // Sync source HTML changes back to editor and parent
  const handleSourceChange = (html: string) => {
    setSourceHtml(html);
    // Extract plain text from HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    const text = tempDiv.textContent || tempDiv.innerText || '';
    onChange(html, text);
  };

  // Sync external value changes (e.g. "Load last sent") into the editor
  useEffect(() => {
    if (value !== sourceHtml) {
      setSourceHtml(value);
      if (editor && value !== editor.getHTML()) {
        editor.commands.setContent(value);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  // When switching from source mode to WYSIWYG, update the editor
  useEffect(() => {
    if (mode === 'wysiwyg' && editor && sourceHtml !== editor.getHTML()) {
      editor.commands.setContent(sourceHtml);
    }
  }, [mode, editor, sourceHtml]);

  const setLink = useCallback(() => {
    if (!editor) return;

    if (linkUrl === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    let url = linkUrl;
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    setLinkUrl('');
    setShowLinkInput(false);
  }, [editor, linkUrl]);

  const removeLink = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().unsetLink().run();
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div data-ev-id="ev_b423c76cc0" className={`rounded-lg border overflow-hidden bg-slate-800 ${error ? 'border-red-500' : 'border-slate-700'}`}>
      {/* Toolbar */}
      <div data-ev-id="ev_62c8c70058" className="flex flex-wrap items-center gap-1 p-2 border-b border-slate-700 bg-slate-850">
        {mode === 'wysiwyg' &&
        <>
            {/* Text formatting */}
            <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive('bold')}
            title="Bold">

              <Bold className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive('italic')}
            title="Italic">

              <Italic className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            active={editor.isActive('underline')}
            title="Underline">

              <UnderlineIcon className="w-4 h-4" />
            </ToolbarButton>

            <div data-ev-id="ev_f96eb9d93a" className="w-px h-6 bg-slate-600 mx-1" />

            {/* Lists */}
            <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive('bulletList')}
            title="Bullet List">

              <List className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive('orderedList')}
            title="Numbered List">

              <ListOrdered className="w-4 h-4" />
            </ToolbarButton>

            <div data-ev-id="ev_e0c18e5918" className="w-px h-6 bg-slate-600 mx-1" />

            {/* Headings */}
            <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor.isActive('heading', { level: 1 })}
            title="Heading 1">

              <Heading1 className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive('heading', { level: 2 })}
            title="Heading 2">

              <Heading2 className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
            onClick={() => editor.chain().focus().setParagraph().run()}
            active={editor.isActive('paragraph')}
            title="Paragraph">

              <Pilcrow className="w-4 h-4" />
            </ToolbarButton>

            <div data-ev-id="ev_f5e8b45ab4" className="w-px h-6 bg-slate-600 mx-1" />

            {/* Link */}
            <div data-ev-id="ev_8acbaebc98" className="relative">
              <ToolbarButton
              onClick={() => {
                if (editor.isActive('link')) {
                  const attrs = editor.getAttributes('link');
                  setLinkUrl(attrs.href || '');
                }
                setShowLinkInput(!showLinkInput);
              }}
              active={editor.isActive('link') || showLinkInput}
              title="Add Link">

                <LinkIcon className="w-4 h-4" />
              </ToolbarButton>
              {showLinkInput &&
            <div data-ev-id="ev_de629228ad" className="absolute top-full left-0 mt-1 p-2 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-10 flex gap-2">
                  <input data-ev-id="ev_53c64ca01c"
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              className="px-2 py-1 text-sm bg-slate-800 border border-slate-600 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 w-48"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setLink();
                }
              }} />

                  <button data-ev-id="ev_730f28f5da"
              onClick={setLink}
              className="px-2 py-1 text-sm bg-emerald-600 hover:bg-emerald-500 rounded">

                    Set
                  </button>
                  <button data-ev-id="ev_f82669fb18"
              onClick={() => setShowLinkInput(false)}
              className="px-2 py-1 text-sm bg-slate-700 hover:bg-slate-600 rounded">

                    Cancel
                  </button>
                </div>
            }
            </div>
            {editor.isActive('link') &&
          <ToolbarButton onClick={removeLink} title="Remove Link">
                <Unlink className="w-4 h-4" />
              </ToolbarButton>
          }

            <div data-ev-id="ev_4089014390" className="w-px h-6 bg-slate-600 mx-1" />

            {/* Clear formatting */}
            <ToolbarButton
            onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
            title="Clear Formatting">

              <RemoveFormatting className="w-4 h-4" />
            </ToolbarButton>
          </>
        }

        {/* Spacer */}
        <div data-ev-id="ev_61e14e4f7e" className="flex-1" />

        {/* Mode toggles */}
        <div data-ev-id="ev_bf7c782141" className="flex gap-1">
          <button data-ev-id="ev_2c73901a15"
          onClick={() => setMode('wysiwyg')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors ${
          mode === 'wysiwyg' ?
          'bg-emerald-600 text-white' :
          'bg-slate-700 text-slate-300 hover:bg-slate-600'}`
          }>

            <Edit3 className="w-4 h-4" />
            Editor
          </button>
          <button data-ev-id="ev_b491762ba5"
          onClick={() => setMode('source')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors ${
          mode === 'source' ?
          'bg-violet-600 text-white' :
          'bg-slate-700 text-slate-300 hover:bg-slate-600'}`
          }>

            <Code className="w-4 h-4" />
            HTML
          </button>
          <button data-ev-id="ev_c515d578b1"
          onClick={() => setMode('preview')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors ${
          mode === 'preview' ?
          'bg-sky-600 text-white' :
          'bg-slate-700 text-slate-300 hover:bg-slate-600'}`
          }>

            <Eye className="w-4 h-4" />
            Preview
          </button>
        </div>
      </div>

      {/* Content area based on mode */}
      {mode === 'wysiwyg' &&
      <div data-ev-id="ev_cd6ce49ee8" className="relative">
          <EditorContent editor={editor} />
          {editor.isEmpty &&
        <div data-ev-id="ev_0bde0f88f0" className="absolute top-3 left-4 text-slate-500 pointer-events-none">
              {placeholder}
            </div>
        }
        </div>
      }

      {mode === 'source' &&
      <div data-ev-id="ev_cdf1501e59" className="relative">
          <textarea data-ev-id="ev_ec05b1c5ec"
        value={sourceHtml}
        onChange={(e) => handleSourceChange(e.target.value)}
        placeholder="Paste your HTML email template here..."
        className="w-full min-h-[300px] px-4 py-3 bg-slate-900 text-slate-300 font-mono text-sm resize-none focus:outline-none"
        spellCheck={false} />

          <div data-ev-id="ev_9856d16667" className="absolute top-2 right-2 px-2 py-1 bg-slate-700 rounded text-xs text-slate-400">
            HTML Source
          </div>
        </div>
      }

      {mode === 'preview' &&
      <div data-ev-id="ev_38ccda42d4" className="min-h-[200px] bg-white">
          <div data-ev-id="ev_21261b1a3e"
        className="p-0"
        dangerouslySetInnerHTML={{ __html: sourceHtml }} />

        </div>
      }
    </div>);

}

function ToolbarButton({
  onClick,
  active,
  title,
  children





}: {onClick: () => void;active?: boolean;title: string;children: React.ReactNode;}) {
  return (
    <button data-ev-id="ev_7565ce340b"
    type="button"
    onClick={onClick}
    title={title}
    className={`p-2 rounded transition-colors ${
    active ?
    'bg-emerald-600 text-white' :
    'text-slate-400 hover:bg-slate-700 hover:text-white'}`
    }>

      {children}
    </button>);

}