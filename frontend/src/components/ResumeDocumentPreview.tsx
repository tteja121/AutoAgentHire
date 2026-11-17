import React, { useState, useEffect, useRef } from 'react';
import mammoth from 'mammoth';
import DOMPurify from 'dompurify';
import { 
  FileText, Download, X, AlertCircle, RefreshCw, Loader2, 
  Eye, CheckCircle2, FileCode, ExternalLink 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { API_BASE_URL, resolveApiUrl, getAuthenticatedFileUrl } from '@/lib/api';

export interface ResumeDocumentPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  file?: File | null;
  fileUrl?: string | null;
  filename?: string;
}

export function ResumeDocumentPreview({
  isOpen,
  onClose,
  file,
  fileUrl,
  filename: propFilename,
}: ResumeDocumentPreviewProps) {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [docHtml, setDocHtml] = useState<string | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [plainText, setPlainText] = useState<string | null>(null);
  const [resolvedType, setResolvedType] = useState<'pdf' | 'docx' | 'txt' | 'doc' | 'unsupported'>('pdf');
  const [resolvedName, setResolvedName] = useState<string>('resume.pdf');

  // Track active blob URLs to revoke on unmount or file change
  const activeBlobUrlRef = useRef<string | null>(null);

  const cleanupBlobUrl = () => {
    if (activeBlobUrlRef.current) {
      URL.revokeObjectURL(activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDocument();
    } else {
      cleanupBlobUrl();
      setDocHtml(null);
      setPdfBlobUrl(null);
      setPlainText(null);
      setError(null);
    }
    return () => {
      cleanupBlobUrl();
    };
  }, [isOpen, file, fileUrl]);

  const detectFileType = (name: string, mime?: string): 'pdf' | 'docx' | 'txt' | 'doc' | 'unsupported' => {
    const lowerName = name.toLowerCase();
    if (lowerName.endsWith('.pdf') || mime === 'application/pdf') return 'pdf';
    if (
      lowerName.endsWith('.docx') ||
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) return 'docx';
    if (lowerName.endsWith('.doc') || mime === 'application/msword') return 'doc';
    if (lowerName.endsWith('.txt') || mime?.startsWith('text/')) return 'txt';
    return 'unsupported';
  };

  const loadDocument = async () => {
    setLoading(true);
    setError(null);
    cleanupBlobUrl();
    setDocHtml(null);
    setPdfBlobUrl(null);
    setPlainText(null);

    const name = file?.name || propFilename || (fileUrl ? fileUrl.split('/').pop()?.split('?')[0] : '') || 'Document';
    setResolvedName(name);

    const detected = detectFileType(name, file?.type);
    setResolvedType(detected);

    try {
      let arrayBuffer: ArrayBuffer;

      if (file) {
        arrayBuffer = await file.arrayBuffer();
      } else if (fileUrl) {
        const token = localStorage.getItem('authToken') || localStorage.getItem('token') || localStorage.getItem('access_token') || '';
        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        let fullUrl = fileUrl;
        if (!fileUrl.startsWith('http') && !fileUrl.startsWith('blob:')) {
          fullUrl = resolveApiUrl(fileUrl);
        }

        const resp = await fetch(fullUrl, { headers });
        if (!resp.ok) {
          throw new Error(`Failed to load document (${resp.status}: ${resp.statusText})`);
        }
        arrayBuffer = await resp.arrayBuffer();
      } else {
        throw new Error('No document file or source URL was provided for preview.');
      }

      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        throw new Error('The document file is empty (0 bytes).');
      }

      if (detected === 'docx') {
        // Convert DOCX to formatted HTML using Mammoth.js
        const result = await mammoth.convertToHtml(
          { arrayBuffer },
          {
            styleMap: [
              "p[style-name='Title'] => h1.document-title:fresh",
              "p[style-name='Subtitle'] => h2.document-subtitle:fresh",
              "p[style-name='Heading 1'] => h2.document-h2:fresh",
              "p[style-name='Heading 2'] => h3.document-h3:fresh",
              "p[style-name='Heading 3'] => h4.document-h4:fresh",
              "table => table.document-table",
            ],
          }
        );

        if (!result.value || !result.value.trim()) {
          // If HTML output is empty, try raw text extraction
          const rawResult = await mammoth.extractRawText({ arrayBuffer });
          if (rawResult.value && rawResult.value.trim()) {
            setPlainText(rawResult.value.trim());
          } else {
            throw new Error('Unable to extract readable text content from this DOCX file.');
          }
        } else {
          // Sanitize converted HTML with DOMPurify
          const sanitized = DOMPurify.sanitize(result.value, {
            USE_PROFILES: { html: true },
            ADD_ATTR: ['target', 'class'],
          });
          setDocHtml(sanitized);
        }
      } else if (detected === 'pdf') {
        const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);
        activeBlobUrlRef.current = blobUrl;
        setPdfBlobUrl(blobUrl);
      } else if (detected === 'txt') {
        const text = new TextDecoder('utf-8', { fatal: false }).decode(arrayBuffer);
        setPlainText(text);
      } else if (detected === 'doc') {
        setError('Legacy Microsoft Word (.doc) binary format cannot be rendered directly in browsers. Please download the document or upload modern .docx or .pdf format.');
      } else {
        setError(`File type (.${name.split('.').pop()}) does not support live document preview. Please use Download below.`);
      }
    } catch (err: any) {
      console.error('Document preview error:', err);
      setError(err?.message || 'Failed to render document preview.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (file) {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else if (pdfBlobUrl) {
      const a = document.createElement('a');
      a.href = pdfBlobUrl;
      a.download = resolvedName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else if (fileUrl) {
      const fullUrl = getAuthenticatedFileUrl(fileUrl);
      window.open(fullUrl, '_blank');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl h-[88vh] max-h-[90vh] flex flex-col p-0 gap-0 bg-[#FBFBFA] border-[#E6E5DC] overflow-hidden editorial-shadow">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E6E5DC] bg-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#123B32]/10 text-[#123B32] flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-[#123B32]" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="font-serif text-lg font-bold text-[#123B32] truncate">
                {resolvedName}
              </DialogTitle>
              <DialogDescription className="text-xs text-[#777D74] flex items-center gap-2 mt-0.5">
                <span>Direct rendering of uploaded document</span>
                <span>•</span>
                <Badge variant="outline" className="text-[10px] uppercase font-mono py-0 px-1.5 border-[#E6E5DC] bg-[#F7F5EF] text-[#123B32]">
                  {resolvedType.toUpperCase()}
                </Badge>
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              className="h-8 text-xs font-semibold border-[#E6E5DC] text-[#123B32] gap-1.5 hover:bg-[#F7F5EF]"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0 text-[#777D74] hover:text-[#123B32] hover:bg-[#F7F5EF] rounded-full"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Document Body Area */}
        <div className="flex-1 w-full overflow-y-auto p-4 sm:p-6 bg-[#F4F2EC]/60 flex items-center justify-center">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-[#777D74]">
              <Loader2 className="w-8 h-8 animate-spin text-[#123B32]" />
              <p className="text-xs font-medium">Rendering document preview...</p>
            </div>
          ) : error ? (
            <div className="max-w-md w-full p-8 rounded-2xl bg-white border border-[#E6E5DC] text-center space-y-4 editorial-shadow my-auto">
              <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-amber-600">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-serif text-base font-bold text-[#123B32]">Document Preview Notice</h4>
                <p className="text-xs text-[#777D74] mt-1 leading-relaxed">{error}</p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadDocument}
                  className="text-xs border-[#E6E5DC] gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry</span>
                </Button>
                <Button
                  size="sm"
                  onClick={handleDownload}
                  className="text-xs bg-[#123B32] text-white hover:bg-[#0E2E27] gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Document</span>
                </Button>
              </div>
            </div>
          ) : resolvedType === 'docx' && docHtml ? (
            <div className="w-full max-w-3xl bg-white rounded-xl border border-[#E6E5DC] p-8 sm:p-12 editorial-shadow my-auto min-h-full">
              <div
                className="docx-rendered-content text-[#202722] text-xs sm:text-sm leading-relaxed space-y-3 font-sans selection:bg-[#123B32]/10"
                dangerouslySetInnerHTML={{ __html: docHtml }}
              />
            </div>
          ) : resolvedType === 'pdf' && pdfBlobUrl ? (
            <div className="w-full h-full min-h-[500px] bg-white rounded-xl border border-[#E6E5DC] overflow-hidden shadow-inner">
              <object
                data={pdfBlobUrl}
                type="application/pdf"
                className="w-full h-full border-0"
              >
                <iframe
                  src={pdfBlobUrl}
                  title="PDF Document Preview"
                  className="w-full h-full border-0"
                >
                  <div className="p-8 text-center text-xs text-[#777D74]">
                    Unable to display PDF inline. <button onClick={handleDownload} className="text-[#123B32] underline font-semibold">Download PDF</button> to view.
                  </div>
                </iframe>
              </object>
            </div>
          ) : plainText ? (
            <div className="w-full max-w-3xl bg-white rounded-xl border border-[#E6E5DC] p-8 editorial-shadow my-auto">
              <pre className="text-xs text-[#202722] font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto">
                {plainText}
              </pre>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-[#E6E5DC] bg-white shrink-0 text-xs text-[#777D74]">
          <span className="flex items-center gap-1.5 text-[11px]">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Document verified and calibrated</span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-xs text-[#123B32] hover:bg-[#F7F5EF] h-8 font-medium"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ResumeDocumentPreview;

