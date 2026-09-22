import { useCallback, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TextAlign from '@tiptap/extension-text-align';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import Placeholder from '@tiptap/extension-placeholder';
import api from '../services/api';
import { buildEmbedUrl } from '../utils/youtube';
import './RichTextEditor.css';

const FontSize = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: { default: null, parseHTML: el => el.style.fontSize, renderHTML: attrs => { if (!attrs.fontSize) return {}; return { style: `font-size: ${attrs.fontSize}` } } },
    };
  },
  addCommands() {
    return {
      setFontSize: fontSize => ({ chain }) => chain().setMark('textStyle', { fontSize }).run(),
      unsetFontSize: () => ({ chain }) => chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

const FontFamily = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontFamily: { default: null, parseHTML: el => el.style.fontFamily, renderHTML: attrs => { if (!attrs.fontFamily) return {}; return { style: `font-family: ${attrs.fontFamily}` } } },
    };
  },
  addCommands() {
    return {
      setFontFamily: fontFamily => ({ chain }) => chain().setMark('textStyle', { fontFamily }).run(),
      unsetFontFamily: () => ({ chain }) => chain().setMark('textStyle', { fontFamily: null }).removeEmptyTextStyle().run(),
    };
  },
});

const TableIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>;
const ImageIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>;
const LinkIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>;
const CodeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>;
const HrIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/></svg>;
const IndentIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="2 6 2 18"/><line x1="6" y1="8" x2="14" y2="8"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="6" y1="16" x2="14" y2="16"/></svg>;
const OutdentIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 6 22 18"/><line x1="18" y1="8" x2="10" y2="8"/><line x1="18" y1="12" x2="6" y2="12"/><line x1="18" y1="16" x2="10" y2="16"/></svg>;
const VideoIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>;

const Iframe = Node.create({
  name: 'iframe',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      src: { default: null },
      title: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: 'iframe' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['iframe', {
      ...HTMLAttributes,
      src: HTMLAttributes.src,
      title: HTMLAttributes.title || 'Video',
      allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
      allowFullScreen: 'true',
    }];
  },
  addCommands() {
    return {
      setIframe: (options) => ({ commands }) => commands.insertContent({ type: 'iframe', attrs: options }),
    };
  },
});

const COLORS = ['#000000','#434343','#666666','#999999','#b7b7b7','#cccccc','#d9d9d9','#efefef','#f3f3f3','#ffffff','#980000','#ff0000','#ff9900','#ffff00','#00ff00','#00ffff','#4a86e8','#0000ff','#9900ff','#ff00ff','#e6b8af','#f4cccc','#fce5cd','#fff2cc','#d9ead3','#d0e0e3','#c9daf8','#cfe2f3','#d9d2e9','#ead1dc','#dd7e6b','#ea9999','#f9cb9c','#ffe599','#b6d7a8','#a2c4c9','#a4c2f4','#9fc5e8','#b4a7d6','#d5a6bd','#cc4125','#e06666','#f6b26b','#ffd966','#93c47d','#76a5af','#6d9eeb','#6fa8dc','#8e7cc3','#c27ba0','#a61c00','#cc0000','#e69138','#f1c232','#6aa84f','#45818e','#3c78d8','#3d85c6','#674ea7','#a64d79','#85200c','#990000','#b45f06','#bf9000','#38761d','#134f5c','#1155cc','#0b5394','#351c75','#741b47','#5b0f00','#660000','#783f04','#7f6000','#274e13','#0c343d','#1c4587','#073763','#20124d','#4c1130'];
const FONTS = ['Arial','Georgia','Times New Roman','Verdana','Courier New','Comic Sans MS','Impact','Trebuchet MS','Palatino','Tahoma'];
const SIZES = ['12px','14px','16px','18px','20px','24px','28px','32px','36px','48px','60px'];

export default function RichTextEditor({ value, onChange, placeholder }) {
  const fileInputRef = useRef(null);
  const linkInputRef = useRef(null);
  const imageUrlInputRef = useRef(null);
  const [videoPanelOpen, setVideoPanelOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoError, setVideoError] = useState('');

  const handleImageUpload = useCallback(async (file) => {
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await api.post('/contenidos/upload/editor-image', formData);
      return res.data.url;
    } catch (err) {
      console.error('Error subiendo imagen:', err);
      return null;
    }
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
      Underline,
      TextStyle,
      FontSize,
      FontFamily,
      Link.configure({ openOnClick: false }),
      Image.configure({ inline: false, allowBase64: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Color,
      Highlight.configure({ multicolor: true }),
      HorizontalRule,
      Iframe,
      Placeholder.configure({ placeholder: placeholder || 'Escribe aquí el contenido de tu lección...' }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
  });

  const handleImageBtnClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file || !editor) return;
      const url = await handleImageUpload(file);
      if (url) editor.chain().focus().setImage({ src: url }).run();
    };
    input.click();
  };

  const handleImageUrl = () => {
    const url = imageUrlInputRef.current?.value;
    if (!url || !editor) return;
    editor.chain().focus().setImage({ src: url }).run();
    imageUrlInputRef.current.value = '';
  };

  const handleLink = () => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL del enlace:', previousUrl || 'https://');
    if (url === null) return;
    if (url === '') { editor.chain().focus().unsetLink().run(); return; }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const findExistingIframe = () => {
    if (!editor) return null;
    let found = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'iframe' && !found) {
        found = { pos, attrs: node.attrs };
        return false;
      }
      return true;
    });
    return found;
  };

  const openVideoPanel = () => {
    if (!editor) return;
    const existing = findExistingIframe();
    setVideoUrl(existing?.attrs?.src || '');
    setVideoError('');
    setVideoPanelOpen(true);
  };

  const closeVideoPanel = () => {
    setVideoPanelOpen(false);
    setVideoError('');
  };

  const handleVideoInsert = () => {
    if (!editor) return;
    const value = videoUrl.trim();
    if (!value) {
      setVideoError('Ingresa la URL del video de YouTube.');
      return;
    }
    const src = buildEmbedUrl(value);
    if (!src) {
      setVideoError('El enlace no corresponde a un video válido de YouTube.');
      return;
    }
    const existing = findExistingIframe();
    if (existing) {
      const node = editor.state.doc.nodeAt(existing.pos);
      const tr = editor.state.tr.setNodeMarkup(existing.pos, undefined, {
        src,
        title: node?.attrs?.title || 'Video de YouTube',
      });
      editor.view.dispatch(tr);
    } else {
      editor.chain().focus().setIframe({ src, title: 'Video de YouTube' }).run();
    }
    setVideoPanelOpen(false);
    setVideoError('');
  };

  const addTable = () => {
    editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  if (!editor) return null;

  const ToolBtn = ({ onClick, active, title, children }) => (
    <button type="button" onClick={onClick} className={`rte-btn ${active ? 'rte-active' : ''}`} title={title}>{children}</button>
  );

  const handleFontSize = (e) => {
    const val = e.target.value;
    if (!val) return;
    editor.chain().focus().setFontSize(val).run();
  };

  const handleFontFamily = (e) => {
    const val = e.target.value;
    if (!val) return;
    editor.chain().focus().setFontFamily(val).run();
  };

  return (
    <div className="rich-text-editor">
      <div className="rte-toolbar">
        <div className="rte-group rte-group-label">
          <label className="rte-select-label" htmlFor="font-family-select">Fuente</label>
          <select id="font-family-select" className="rte-select" onChange={handleFontFamily} title="Tipo de letra">
            <option value="">Seleccionar</option>
            {FONTS.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
          </select>
          <label className="rte-select-label" htmlFor="font-size-select">Tamaño</label>
          <select id="font-size-select" className="rte-select rte-font-size" onChange={handleFontSize} title="Tamaño de letra">
            <option value="">Seleccionar</option>
            {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="rte-divider" />

        <div className="rte-group">
          <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Negrita (Ctrl+B)"><b>B</b></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Cursiva (Ctrl+I)"><i>I</i></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Subrayado (Ctrl+U)"><u>U</u></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Tachado"><s>S</s></ToolBtn>
        </div>

        <div className="rte-divider" />

        <div className="rte-group">
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Título 1">H1</ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Título 2">H2</ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Título 3">H3</ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()} active={editor.isActive('heading', { level: 4 })} title="Título 4">H4</ToolBtn>
        </div>

        <div className="rte-divider" />

        <div className="rte-group">
          <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Lista con viñetas">•≡</ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Lista numerada">1.</ToolBtn>
        </div>

        <div className="rte-divider" />

        <div className="rte-group">
          <ToolBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Alinear izquierda">
            <svg viewBox="0 0 24 24" width="16" height="16"><line x1="3" y1="6" x2="15" y2="6" stroke="currentColor" strokeWidth="2"/><line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2"/><line x1="3" y1="14" x2="15" y2="14" stroke="currentColor" strokeWidth="2"/><line x1="3" y1="18" x2="21" y2="18" stroke="currentColor" strokeWidth="2"/></svg>
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Centrar">
            <svg viewBox="0 0 24 24" width="16" height="16"><line x1="6" y1="6" x2="18" y2="6" stroke="currentColor" strokeWidth="2"/><line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2"/><line x1="6" y1="14" x2="18" y2="14" stroke="currentColor" strokeWidth="2"/><line x1="3" y1="18" x2="21" y2="18" stroke="currentColor" strokeWidth="2"/></svg>
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Alinear derecha">
            <svg viewBox="0 0 24 24" width="16" height="16"><line x1="9" y1="6" x2="21" y2="6" stroke="currentColor" strokeWidth="2"/><line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2"/><line x1="9" y1="14" x2="21" y2="14" stroke="currentColor" strokeWidth="2"/><line x1="3" y1="18" x2="21" y2="18" stroke="currentColor" strokeWidth="2"/></svg>
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().setTextAlign('justify').run()} active={editor.isActive({ textAlign: 'justify' })} title="Justificar">
            <svg viewBox="0 0 24 24" width="16" height="16"><line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" strokeWidth="2"/><line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2"/><line x1="3" y1="14" x2="21" y2="14" stroke="currentColor" strokeWidth="2"/><line x1="3" y1="18" x2="21" y2="18" stroke="currentColor" strokeWidth="2"/></svg>
          </ToolBtn>
        </div>

        <div className="rte-divider" />

        <div className="rte-group">
          <ToolBtn onClick={() => editor.chain().focus().sinkListItem('listItem').run()} title="Aumentar sangría"><IndentIcon /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().liftListItem('listItem').run()} title="Disminuir sangría"><OutdentIcon /></ToolBtn>
        </div>

        <div className="rte-divider" />

        <div className="rte-group">
          <label className="rte-color-label" title="Color de texto">
            <svg viewBox="0 0 24 24" width="16" height="16"><path d="M11 3l-7 15h3l1-3h7l1 3h3L13 3h-2zm-1.5 9l2.5-6 2.5 6H9.5z" fill={editor.getAttributes('textStyle').color || '#000'}/></svg>
            <input type="color" className="rte-color-input" value={editor.getAttributes('textStyle').color || '#000000'} onChange={e => editor.chain().focus().setColor(e.target.value).run()} />
          </label>
          <label className="rte-color-label" title="Color de fondo">
            <svg viewBox="0 0 24 24" width="16" height="16"><rect x="3" y="3" width="18" height="18" rx="1" fill={editor.getAttributes('highlight').color || '#ffff00'}/></svg>
            <input type="color" className="rte-color-input" value={(editor.getAttributes('highlight').color || '#ffff00').replace('#','')} onChange={e => editor.chain().focus().toggleHighlight({ color: e.target.value }).run()} />
          </label>
        </div>

        <div className="rte-divider" />

        <div className="rte-group">
          <ToolBtn onClick={handleLink} active={editor.isActive('link')} title="Insertar enlace"><LinkIcon /></ToolBtn>
          <ToolBtn onClick={openVideoPanel} title="Insertar video de YouTube"><VideoIcon /></ToolBtn>
          <ToolBtn onClick={addTable} title="Insertar tabla"><TableIcon /></ToolBtn>
          <ToolBtn onClick={handleImageBtnClick} title="Insertar imagen (desde computador)"><ImageIcon /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Línea divisoria"><HrIcon /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="Bloque de código"><CodeIcon /></ToolBtn>
        </div>
      </div>

      {videoPanelOpen && (
        <div className="rte-video-panel">
          <label className="rte-video-label" htmlFor="rte-video-url">
            Insertar video de YouTube
          </label>
          <input
            id="rte-video-url"
            type="text"
            value={videoUrl}
            onChange={(e) => {
              setVideoUrl(e.target.value);
              setVideoError('');
            }}
            placeholder="https://www.youtube.com/watch?v=..."
            className={`rte-url-input ${videoError ? 'rte-input-error' : ''}`}
          />
          <p className="rte-video-help">
            Pega el enlace del video de YouTube (ej. https://www.youtube.com/watch?v=...)
          </p>
          {videoError && <p className="rte-video-error-msg">{videoError}</p>}
          <div className="rte-video-actions">
            <button type="button" className="rte-url-btn" onClick={handleVideoInsert}>
              Insertar video
            </button>
            <button type="button" className="rte-video-cancel" onClick={closeVideoPanel}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="rte-extra-actions">
        <div className="rte-extra-row">
          <input ref={imageUrlInputRef} type="text" placeholder="URL de imagen..." className="rte-url-input" />
          <button type="button" onClick={handleImageUrl} className="rte-url-btn">Insertar imagen por URL</button>
        </div>
      </div>

      <div className="rte-content-wrapper">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
