/**
 * RealtimePreviewRenderer
 * Composición visual de Skins en tiempo real
 *
 * Features:
 * - Canvas-based rendering
 * - Wallpaper background (vertical/horizontal)
 * - Icon grid overlay (dynamic scaling)
 * - Font applied to preview text
 * - Export as PNG (high-res)
 */

import React, { useEffect, useRef, useState } from 'react';

interface PreviewConfig {
  wallpaper_url?: string;
  icons_urls?: string[];
  font_url?: string;
  name: string;
  orientation: 'vertical' | 'horizontal';
}

interface PreviewState {
  isRendering: boolean;
  error: string | null;
  preview: HTMLCanvasElement | null;
}

export const RealtimePreviewRenderer: React.FC<{ config: PreviewConfig }> = ({ config }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<PreviewState>({
    isRendering: false,
    error: null,
    preview: null,
  });

  /**
   * Cargar imagen desde URL a Canvas
   */
  const loadImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });
  };

  /**
   * Cargar fuente personalizada
   */
  const loadFont = async (fontUrl: string) => {
    if (!fontUrl) return;
    try {
      const fontFace = new FontFace('CustomFont', `url(${fontUrl})`);
      await fontFace.load();
      document.fonts.add(fontFace);
    } catch (error) {
      console.warn('Font load failed:', error);
    }
  };

  /**
   * Renderizar preview completo
   */
  const renderPreview = async () => {
    setState(prev => ({ ...prev, isRendering: true, error: null }));

    try {
      if (!canvasRef.current) throw new Error('Canvas ref not available');

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context not available');

      // Dimensiones según orientación
      const isVertical = config.orientation === 'vertical';
      const canvasWidth = isVertical ? 375 : 667;
      const canvasHeight = isVertical ? 812 : 375;

      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      // 1. Renderizar Wallpaper (fondo)
      if (config.wallpaper_url) {
        try {
          const wallpaper = await loadImage(config.wallpaper_url);
          ctx.drawImage(wallpaper, 0, 0, canvasWidth, canvasHeight);
        } catch (error) {
          console.warn('Wallpaper load error:', error);
          // Fallback: gradient fondo
          const gradient = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
          gradient.addColorStop(0, '#0a2540');
          gradient.addColorStop(1, '#1a4d7a');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        }
      }

      // 2. Grid de Iconos (overlay)
      if (config.icons_urls && config.icons_urls.length > 0) {
        const gridCols = 4;
        const gridRows = Math.ceil(config.icons_urls.length / gridCols);

        const iconSize = Math.min(canvasWidth / (gridCols + 0.5), (canvasHeight * 0.6) / gridRows);
        const startX = (canvasWidth - iconSize * gridCols) / 2;
        const startY = canvasHeight * 0.3;

        for (let i = 0; i < config.icons_urls.length; i++) {
          try {
            const icon = await loadImage(config.icons_urls[i]);
            const col = i % gridCols;
            const row = Math.floor(i / gridCols);
            const x = startX + col * iconSize + iconSize * 0.1;
            const y = startY + row * iconSize + iconSize * 0.1;

            // Marco circular para icono
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.beginPath();
            ctx.arc(x + iconSize * 0.4, y + iconSize * 0.4, iconSize * 0.45, 0, Math.PI * 2);
            ctx.fill();

            // Icono
            ctx.drawImage(icon, x, y, iconSize * 0.8, iconSize * 0.8);
          } catch (error) {
            console.warn(`Icon ${i} load error:`, error);
          }
        }
      }

      // 3. Apliear Fuente y Texto
      if (config.font_url) {
        await loadFont(config.font_url);
      }

      // Texto de preview sobre los iconos
      ctx.fillStyle = 'white';
      ctx.font = `bold 32px ${config.font_url ? 'CustomFont' : 'Arial'}, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      // Shadow para mejor legibilidad
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;

      ctx.fillText(config.name, canvasWidth / 2, canvasHeight * 0.05);
      ctx.shadowColor = 'transparent';

      setState(prev => ({
        ...prev,
        isRendering: false,
        preview: canvas,
      }));

      console.log('✅ Preview rendered successfully');
    } catch (error) {
      setState(prev => ({
        ...prev,
        isRendering: false,
        error: (error as Error).message,
      }));
      console.error('❌ Preview render error:', error);
    }
  };

  useEffect(() => {
    renderPreview();
  }, [config]);

  /**
   * Exportar preview como PNG
   */
  const exportPreview = () => {
    if (!canvasRef.current) return;

    const link = document.createElement('a');
    link.href = canvasRef.current.toDataURL('image/png');
    link.download = `preview-${config.name}-${Date.now()}.png`;
    link.click();
  };

  return (
    <div className="preview-renderer">
      <div className="preview-canvas-wrapper">
        <canvas
          ref={canvasRef}
          style={{
            border: '4px solid #c5a065',
            borderRadius: '12px',
            maxWidth: '100%',
            height: 'auto',
            boxShadow: '0 8px 20px rgba(0, 0, 0, 0.2)',
          }}
        />
      </div>

      <div className="preview-controls">
        {state.isRendering && <p>🔄 Renderizando preview...</p>}
        {state.error && <p style={{ color: 'red' }}>❌ Error: {state.error}</p>}
        <button
          onClick={exportPreview}
          disabled={state.isRendering || !!state.error}
          className="btn-export"
        >
          📥 Descargar Preview
        </button>
      </div>

      <style>{`
        .preview-renderer {
          display: flex;
          flex-direction: column;
          gap: 20px;
          padding: 20px;
          background: #f5f7fa;
          border-radius: 12px;
        }

        .preview-canvas-wrapper {
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 20px;
          background: white;
          border-radius: 8px;
        }

        .preview-controls {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 10px;
        }

        .btn-export {
          padding: 10px 20px;
          background: #c5a065;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.3s ease;
        }

        .btn-export:hover:not(:disabled) {
          background: #0a2540;
          transform: translateY(-2px);
        }

        .btn-export:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};

export default RealtimePreviewRenderer;
