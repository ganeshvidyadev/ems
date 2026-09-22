'use client';

import { useState, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Minimize2, X, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { ProductThumb } from '@/components/product-thumb';
import { cn } from '@/lib/utils';

interface ProductGalleryProps {
  productName: string;
  saving?: number | null;
  images?: Array<{ id: string; url?: string; altText?: string }>;
  className?: string;
}

// Visual mockup angles for richer PDP showcase when only name/base asset is present
const ANGLES = [
  { id: 'front', label: 'Front View', icon: '01' },
  { id: 'angle', label: 'Perspective', icon: '02' },
  { id: 'detail', label: 'Close Up', icon: '03' },
  { id: 'in-use', label: 'In Context', icon: '04' },
];

export function ProductGallery({ productName, saving, images = [], className }: ProductGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const galleryItems = images.length > 0 
    ? images.map((img, i) => ({ id: img.id || String(i), label: img.altText || `Angle ${i + 1}`, url: img.url }))
    : ANGLES.map((angle) => ({ id: angle.id, label: `${productName} - ${angle.label}`, url: undefined }));

  const activeItem = galleryItems[selectedIndex] ?? galleryItems[0] ?? { id: 'default', label: productName, url: undefined };

  const handlePrev = useCallback(() => {
    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : galleryItems.length - 1));
    setZoomLevel(1);
  }, [galleryItems.length]);

  const handleNext = useCallback(() => {
    setSelectedIndex((prev) => (prev < galleryItems.length - 1 ? prev + 1 : 0));
    setZoomLevel(1);
  }, [galleryItems.length]);

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (!lightboxOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightboxOpen(false);
      else if (e.key === 'ArrowLeft') handlePrev();
      else if (e.key === 'ArrowRight') handleNext();
      else if (e.key === '+' || e.key === '=') setZoomLevel((z) => Math.min(3, z + 0.5));
      else if (e.key === '-') setZoomLevel((z) => Math.max(1, z - 0.5));
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen, handlePrev, handleNext]);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Main Image Stage */}
      <div className="relative group overflow-hidden rounded-theme border border-line bg-surface-alt/20">
        <div 
          className="aspect-square w-full cursor-zoom-in transition-transform duration-300 group-hover:scale-[1.02]"
          onClick={() => {
            setLightboxOpen(true);
            setZoomLevel(1);
          }}
          title="Click to expand & zoom"
        >
          {activeItem.url ? (
            <img 
              src={activeItem.url} 
              alt={activeItem.label} 
              className="h-full w-full object-cover object-center" 
            />
          ) : (
            <ProductThumb 
              name={`${productName} ${selectedIndex > 0 ? selectedIndex + 1 : ''}`} 
              className="aspect-square w-full" 
              textClassName="text-7xl" 
            />
          )}
        </div>

        {/* Badges */}
        <div className="absolute left-3 top-3 flex flex-col gap-1.5 pointer-events-none">
          {saving !== null && saving !== undefined && saving > 0 && (
            <Badge tone="sale" className="text-xs shadow-sm">
              {saving}% OFF
            </Badge>
          )}
        </div>

        {/* Hover zoom overlay indicator */}
        <button
          type="button"
          onClick={() => {
            setLightboxOpen(true);
            setZoomLevel(1);
          }}
          className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-surface/90 px-3 py-1 text-xs font-medium text-ink shadow-sm backdrop-blur transition hover:bg-surface"
          aria-label="View fullscreen gallery"
        >
          <Eye className="h-3.5 w-3.5" />
          <span>Zoom</span>
        </button>

        {/* Quick nav arrows on main stage */}
        {galleryItems.length > 1 && (
          <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 flex justify-between pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              className="pointer-events-auto rounded-full bg-surface/90 p-2 text-ink shadow-md backdrop-blur hover:bg-surface hover:scale-105 transition"
              aria-label="Previous view"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              className="pointer-events-auto rounded-full bg-surface/90 p-2 text-ink shadow-md backdrop-blur hover:bg-surface hover:scale-105 transition"
              aria-label="Next view"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Thumbnail Bar */}
      {galleryItems.length > 1 && (
        <div className="flex items-center gap-3 overflow-x-auto pb-1">
          {galleryItems.map((item, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedIndex(idx)}
                className={cn(
                  'relative h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 transition focus:outline-none focus:ring-2 focus:ring-brand',
                  isSelected
                    ? 'border-brand ring-1 ring-brand'
                    : 'border-line opacity-70 hover:opacity-100 hover:border-ink/40'
                )}
                aria-label={item.label}
              >
                {item.url ? (
                  <img src={item.url} alt={item.label} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-surface-alt text-xs font-semibold text-ink-muted">
                    {idx === 0 ? 'Main' : `#${idx + 1}`}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Fullscreen Lightbox Modal */}
      {lightboxOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white animate-in fade-in duration-200">
          {/* Header Bar */}
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
            <div className="flex items-center gap-3">
              <span className="font-medium text-sm text-white/80">
                {productName}
              </span>
              <span className="text-xs text-white/50">
                ({selectedIndex + 1} / {galleryItems.length})
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(1, z - 0.5))}
                disabled={zoomLevel <= 1}
                className="rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-30 transition"
                title="Zoom Out (-)"
              >
                <ZoomOut className="h-5 w-5" />
              </button>
              <span className="min-w-[40px] text-center text-xs font-mono text-white/70">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(3, z + 0.5))}
                disabled={zoomLevel >= 3}
                className="rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-30 transition"
                title="Zoom In (+)"
              >
                <ZoomIn className="h-5 w-5" />
              </button>
              <div className="h-4 w-px bg-white/20 mx-1" />
              <button
                type="button"
                onClick={() => setLightboxOpen(false)}
                className="rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white transition"
                title="Close (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Lightbox Center Image Stage */}
          <div className="relative flex-1 flex items-center justify-center overflow-hidden p-6 select-none">
            <div 
              className="transition-transform duration-200 ease-out max-h-full max-w-full"
              style={{ transform: `scale(${zoomLevel})` }}
            >
              {activeItem.url ? (
                <img 
                  src={activeItem.url} 
                  alt={activeItem.label} 
                  className="max-h-[80vh] max-w-[85vw] object-contain rounded-lg shadow-2xl" 
                />
              ) : (
                <div className="flex h-96 w-96 items-center justify-center rounded-2xl bg-surface-alt/10 border border-white/20 text-white shadow-2xl">
                  <ProductThumb 
                    name={`${productName} ${selectedIndex > 0 ? selectedIndex + 1 : ''}`} 
                    className="h-full w-full" 
                    textClassName="text-8xl" 
                  />
                </div>
              )}
            </div>

            {/* Left / Right Nav Arrows */}
            {galleryItems.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={handlePrev}
                  className="absolute left-6 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white backdrop-blur hover:bg-white/20 hover:scale-110 transition"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="absolute right-6 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white backdrop-blur hover:bg-white/20 hover:scale-110 transition"
                  aria-label="Next image"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}
          </div>

          {/* Bottom Thumbnail Strip */}
          {galleryItems.length > 1 && (
            <div className="flex justify-center gap-3 border-t border-white/10 py-3 bg-black/40">
              {galleryItems.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedIndex(idx);
                    setZoomLevel(1);
                  }}
                  className={cn(
                    'h-12 w-12 rounded overflow-hidden border-2 transition',
                    idx === selectedIndex ? 'border-brand scale-105' : 'border-white/20 opacity-50 hover:opacity-100'
                  )}
                >
                  {item.url ? (
                    <img src={item.url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-white/10 text-[10px] font-bold text-white">
                      {idx + 1}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
