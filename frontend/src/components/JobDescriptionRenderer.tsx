import React, { useMemo } from "react";
import DOMPurify from "dompurify";

interface JobDescriptionRendererProps {
  content?: string | null;
  className?: string;
}

/**
 * Safely unescapes common and multi-encoded HTML entities that might have been stored encoded.
 * Performs multiple passes to handle double-encoded entities such as &amp;lt;h2&amp;gt; -> &lt;h2&gt; -> <h2>.
 */
export function unescapeHtmlEntities(input?: string | null): string {
  if (!input) return "";
  let text = String(input);
  // Decode up to 3 passes to handle multi-encoded entities safely
  for (let i = 0; i < 3; i++) {
    if (!text.includes("&")) break;
    const prev = text;
    text = text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, "/")
      .replace(/&nbsp;/g, " ");
    if (text === prev) break;
  }
  return text;
}

/**
 * Detects whether a string contains actual HTML tags.
 */
export function hasHtmlTags(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text);
}

/**
 * Generates a clean, plain-text preview of a job description for job cards.
 * Strips all HTML tags, converts block tags to spaces so text does not collide,
 * unescapes entities, and truncates cleanly at word boundaries.
 */
export function getCleanJobDescriptionPreview(
  input?: string | null,
  maxLength: number = 180
): string {
  if (!input) return "No description provided.";
  let text = unescapeHtmlEntities(input);

  // Convert block element endings and line breaks to spaces
  text = text
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|tr|td|blockquote|section|header|footer)>/gi, " ")
    .replace(/<(br|hr)\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ") // Strip any remaining tags
    .replace(/&[a-z#0-9]+;/gi, " ") // Strip any stray unrecognized entities
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim();

  if (!text) return "No description provided.";
  if (text.length <= maxLength) return text;

  const slice = text.slice(0, maxLength);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > maxLength * 0.7) {
    return slice.slice(0, lastSpace).trim() + "...";
  }
  return slice.trim() + "...";
}

export const JobDescriptionRenderer: React.FC<JobDescriptionRendererProps> = ({
  content,
  className = "",
}) => {
  const processed = useMemo(() => {
    if (!content || !content.trim()) {
      return { isHtml: false, html: "", paragraphs: [] };
    }

    const decoded = unescapeHtmlEntities(content.trim());

    if (hasHtmlTags(decoded)) {
      const sanitized = DOMPurify.sanitize(decoded, {
        ALLOWED_TAGS: [
          "h1", "h2", "h3", "h4", "h5", "h6",
          "p", "span", "strong", "em", "b", "i", "u",
          "ul", "ol", "li", "br", "hr",
          "blockquote", "a", "code", "pre",
          "table", "thead", "tbody", "tr", "th", "td",
        ],
        ALLOWED_ATTR: ["href", "target", "rel", "class", "style"],
      });

      // Ensure all <a> tags open safely in a new tab
      const parser = new DOMParser();
      const doc = parser.parseFromString(sanitized, "text/html");
      doc.querySelectorAll("a").forEach((anchor) => {
        anchor.setAttribute("target", "_blank");
        anchor.setAttribute("rel", "noopener noreferrer");
        anchor.classList.add("text-primary", "underline", "hover:text-primary/80");
      });

      return {
        isHtml: true,
        html: doc.body.innerHTML || sanitized,
        paragraphs: [],
      };
    }

    // Plain-text format: split into natural paragraphs
    const paragraphs = decoded
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);

    return {
      isHtml: false,
      html: "",
      paragraphs: paragraphs.length > 0 ? paragraphs : [decoded],
    };
  }, [content]);

  if (!content || !content.trim()) {
    return (
      <div className={`p-4 rounded-xl bg-white/5 border border-white/5 text-xs text-muted-foreground italic ${className}`}>
        No detailed job description provided.
      </div>
    );
  }

  if (processed.isHtml) {
    return (
      <div
        className={`job-description-content text-xs text-muted-foreground leading-relaxed space-y-3 font-sans [&>h1]:text-base [&>h1]:font-bold [&>h1]:text-foreground [&>h1]:mt-4 [&>h1]:mb-2 [&>h2]:text-sm [&>h2]:font-bold [&>h2]:text-foreground [&>h2]:mt-3 [&>h2]:mb-1.5 [&>h3]:text-xs [&>h3]:font-semibold [&>h3]:text-foreground [&>h3]:mt-2.5 [&>h3]:mb-1 [&>p]:mb-2.5 [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:my-2 [&>ul]:space-y-1 [&>ol]:list-decimal [&>ol]:pl-5 [&>ol]:my-2 [&>ol]:space-y-1 [&>li]:leading-normal [&>strong]:text-foreground [&>strong]:font-semibold ${className}`}
        dangerouslySetInnerHTML={{ __html: processed.html }}
      />
    );
  }

  return (
    <div className={`text-xs text-muted-foreground leading-relaxed space-y-2.5 font-sans ${className}`}>
      {processed.paragraphs.map((para, idx) => (
        <p key={idx} className="whitespace-pre-line">
          {para}
        </p>
      ))}
    </div>
  );
};

export default JobDescriptionRenderer;

