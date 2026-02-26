import { useCallback, useEffect, useState } from "preact/hooks";

interface Image {
  id: number;
  filename: string;
  original_name: string;
}

interface Props {
  images: Image[];
}

export default function ImageLightbox({ images }: Props) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const close = useCallback(() => setOpenIdx(null), []);
  const prev = useCallback(
    () => setOpenIdx((i) => (i !== null ? (i - 1 + images.length) % images.length : null)),
    [images.length],
  );
  const next = useCallback(
    () => setOpenIdx((i) => (i !== null ? (i + 1) % images.length : null)),
    [images.length],
  );

  useEffect(() => {
    if (openIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openIdx, close, prev, next]);

  const current = openIdx !== null ? images[openIdx] : null;

  return (
    <>
      {/* Thumbnail grid */}
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        {images.map((img, idx) => (
          <button
            key={img.id}
            type="button"
            onClick={() => setOpenIdx(idx)}
            class="relative group rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950 aspect-square focus:outline-none focus:ring-2 focus:ring-zinc-500"
          >
            <img
              src={`/api/uploads/${img.filename}`}
              alt={img.original_name}
              class="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
            {/* Hover overlay with zoom icon */}
            <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <svg class="w-7 h-7 text-white drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
              </svg>
            </div>
            {/* Filename bar */}
            <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <span class="text-xs text-white truncate block">{img.original_name}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {current && (
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={close}
        >
          {/* Image + caption — click inside doesn't close */}
          <div
            class="relative flex flex-col items-center gap-3 max-w-[90vw] max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={`/api/uploads/${current.filename}`}
              alt={current.original_name}
              class="max-w-[90vw] max-h-[80vh] object-contain rounded-xl shadow-2xl"
            />
            <p class="text-zinc-400 text-sm">{current.original_name}</p>
          </div>

          {/* Close */}
          <button
            type="button"
            class="absolute top-4 right-4 bg-zinc-800/70 hover:bg-zinc-700 text-white/80 hover:text-white rounded-full p-2 transition"
            onClick={close}
            aria-label="Close"
          >
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Prev / Next */}
          {images.length > 1 && (
            <>
              <button
                type="button"
                class="absolute left-4 top-1/2 -translate-y-1/2 bg-zinc-800/70 hover:bg-zinc-700 text-white/80 hover:text-white rounded-full p-3 transition"
                onClick={(e) => { e.stopPropagation(); prev(); }}
                aria-label="Previous"
              >
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                class="absolute right-4 top-1/2 -translate-y-1/2 bg-zinc-800/70 hover:bg-zinc-700 text-white/80 hover:text-white rounded-full p-3 transition"
                onClick={(e) => { e.stopPropagation(); next(); }}
                aria-label="Next"
              >
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <div class="absolute bottom-6 left-1/2 -translate-x-1/2 text-zinc-500 text-xs tabular-nums">
                {openIdx! + 1} / {images.length}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
