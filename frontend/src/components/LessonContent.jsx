import { useMemo } from 'react';
import { MdPlayCircleOutline } from 'react-icons/md';
import { buildEmbedUrl } from '../utils/youtube';
import './lesson-content.css';

/**
 * Divide el HTML de una lección por los <iframe> de video que contenga.
 * Cada iframe se renderiza aparte (para poder validarlo y hacerlo responsivo);
 * el resto del HTML se conserva tal cual.
 */
function splitByIframes(html) {
  const parts = [];
  const regex = /<iframe\b[^>]*>/gi;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(html)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'html', html: html.slice(lastIndex, match.index) });
    }
    const src = match[0].match(/src\s*=\s*["']([^"']+)["']/i);
    parts.push({ type: 'iframe', src: src ? src[1] : '' });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < html.length) {
    parts.push({ type: 'html', html: html.slice(lastIndex) });
  }

  return parts.filter((part) => (part.type === 'html' ? part.html.trim() : true));
}

function YouTubeEmbed({ src }) {
  const embedUrl = buildEmbedUrl(src);

  if (!embedUrl) {
    return (
      <div className="lesson-video-error" role="alert">
        <MdPlayCircleOutline className="lesson-video-error-icon" />
        <span>El video no pudo cargarse, verifica el enlace.</span>
      </div>
    );
  }

  return (
    <div className="lesson-video-container">
      <iframe
        src={embedUrl}
        title="Video de YouTube"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      ></iframe>
    </div>
  );
}

export default function LessonContent({ html = '' }) {
  const blocks = useMemo(() => splitByIframes(html), [html]);

  return (
    <>
      {blocks.map((block, i) =>
        block.type === 'iframe' ? (
          <YouTubeEmbed key={i} src={block.src} />
        ) : (
          <div key={i} dangerouslySetInnerHTML={{ __html: block.html }} />
        )
      )}
    </>
  );
}