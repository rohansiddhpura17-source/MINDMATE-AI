import React, { useState } from 'react';
import { ExternalLink, Image as ImageIcon, X, ShieldCheck, User } from 'lucide-react';
import { VisualImageItem } from '../../services/visual/types';

interface ImageGalleryVisualProps {
  images: VisualImageItem[];
  topic: string;
}

export function ImageGalleryVisual({ images, topic }: ImageGalleryVisualProps) {
  const [selectedImage, setSelectedImage] = useState<VisualImageItem | null>(null);

  if (!images || images.length === 0) {
    return (
      <div className="p-4 rounded-xl border border-dashed border-gray-300 text-center text-xs text-muted">
        <ImageIcon className="h-6 w-6 mx-auto mb-1 text-gray-400" />
        No verified educational images found for "{topic}".
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted">
        <span className="font-medium text-dark/80 flex items-center gap-1.5">
          <ImageIcon className="h-4 w-4 text-primary" />
          Verified Real-World Media ({images.length})
        </span>
        <span className="text-[11px] text-muted">Wikimedia Commons & Wikipedia</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {images.map((img) => (
          <div
            key={img.id}
            onClick={() => setSelectedImage(img)}
            className="group relative flex flex-col rounded-xl border border-border bg-white overflow-hidden shadow-xs hover:shadow-md transition-all cursor-pointer text-left"
          >
            {/* Image Preview Container */}
            <div className="relative aspect-4/3 bg-gray-100 overflow-hidden">
              <img
                src={img.thumbnail}
                alt={img.title}
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                onError={(e) => {
                  // Fallback for failed image thumbnail load
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2.5">
                <span className="text-white text-xs font-medium">Click to view full image & details</span>
              </div>
            </div>

            {/* Metadata Card Footer */}
            <div className="p-2.5 flex flex-col flex-1 justify-between bg-white">
              <p className="text-xs font-semibold text-dark line-clamp-1 mb-1" title={img.title}>
                {img.title}
              </p>

              <div className="flex items-center justify-between text-[11px] text-muted pt-1 border-t border-gray-100 gap-1">
                <span className="truncate flex items-center gap-1" title={img.author}>
                  <User className="h-3 w-3 shrink-0 text-gray-400" />
                  <span className="truncate">{img.author}</span>
                </span>

                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-medium border border-emerald-200 shrink-0">
                  <ShieldCheck className="h-2.5 w-2.5" />
                  {img.license}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox / Full Resolution Modal */}
      {selectedImage && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="relative bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-gray-50/80">
              <h4 className="text-sm font-semibold text-dark truncate pr-4">{selectedImage.title}</h4>
              <button
                onClick={() => setSelectedImage(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-dark hover:bg-gray-200 transition-colors"
                aria-label="Close image modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Full Image Display */}
            <div className="max-h-[60vh] bg-black flex items-center justify-center overflow-hidden">
              <img
                src={selectedImage.url || selectedImage.thumbnail}
                alt={selectedImage.title}
                className="max-h-[60vh] w-auto max-w-full object-contain"
              />
            </div>

            {/* Modal Details & Attribution */}
            <div className="p-5 space-y-3 bg-white text-xs">
              {selectedImage.description && (
                <p className="text-dark/90 leading-relaxed">{selectedImage.description}</p>
              )}

              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border text-[11px]">
                <div>
                  <span className="text-muted block mb-0.5 font-medium">Creator / Attribution</span>
                  <span className="font-semibold text-dark">{selectedImage.author}</span>
                </div>
                <div>
                  <span className="text-muted block mb-0.5 font-medium">License</span>
                  {selectedImage.licenseUrl ? (
                    <a
                      href={selectedImage.licenseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-primary hover:underline inline-flex items-center gap-1"
                    >
                      {selectedImage.license}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="font-semibold text-dark">{selectedImage.license}</span>
                  )}
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <a
                  href={selectedImage.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-dark text-xs font-medium transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View Original Wikimedia Source Page
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
