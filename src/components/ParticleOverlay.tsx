import { useEffect, useRef } from 'react';
import useGameStore from '../store/useStore';

interface ParticleOverlayProps {
    width: number;
    height: number;
    stageScale: number;
    stagePos: { x: number; y: number };
}

export const ParticleOverlay = ({ width, height, stageScale, stagePos }: ParticleOverlayProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationId: number;

        const render = () => {
            // Clear entire canvas
            // Use setTransform to clear relative to viewport, or just reset and clear
            ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
            ctx.clearRect(0, 0, width, height);

            // Apply Stage Transform to context!
            // This aligns particle layer with Konva zoom/pan
            ctx.translate(stagePos.x, stagePos.y);
            ctx.scale(stageScale, stageScale);

            // Access fresh particles directly from store
            const particles = useGameStore.getState().particles;

            particles.forEach(p => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);

                // Color Logic
                if (p.status === 'ERROR') {
                    ctx.fillStyle = '#ef4444'; // Red
                } else if (p.isResponse) {
                    ctx.fillStyle = '#10b981'; // Green
                } else {
                    ctx.fillStyle = '#f59e0b'; // Amber
                }

                ctx.fill();
            });

            animationId = requestAnimationFrame(render);
        };

        render();
        return () => cancelAnimationFrame(animationId);
    }, [width, height, stageScale, stagePos]);

    return (
        <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 pointer-events-none"
            width={width}
            height={height}
        />
    );
};
