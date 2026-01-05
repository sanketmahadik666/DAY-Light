'use client';

'use client';

import { useEffect, useRef } from 'react';

interface Ripple {
  x: number;
  y: number;
  radius: number;
  velocity: number;
  alpha: number;
  hue: number;
  waveCount: number; // Number of internal waves
}

export function RippleEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ripplesRef = useRef<Ripple[]>([]);
  const lastPosRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const hueRef = useRef(200);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    let dpr = 1;

    const resizeCanvas = () => {
      dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const now = Date.now();
      let speed = 0;
      
      if (lastPosRef.current) {
        const dx = e.clientX - lastPosRef.current.x;
        const dy = e.clientY - lastPosRef.current.y;
        const dt = now - lastPosRef.current.time;
        speed = Math.min(Math.hypot(dx, dy) / (dt || 1), 15);
      }

      hueRef.current = (hueRef.current + 0.5) % 360;

      // Only spawn if moved enough or enough time passed
      if (!lastPosRef.current || speed > 0.5) {
        ripplesRef.current.push({
          x: e.clientX,
          y: e.clientY,
          radius: 1 + speed,
          velocity: 1 + speed * 0.3,
          alpha: 0.6 + Math.min(speed * 0.05, 0.4),
          hue: hueRef.current,
          waveCount: 2 // Create a double wave for interference look
        });
      }

      lastPosRef.current = { x: e.clientX, y: e.clientY, time: now };
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

      // Filter dead ripples
      ripplesRef.current = ripplesRef.current.filter((r) => r.alpha > 0.01);

      ripplesRef.current.forEach((ripple) => {
        ripple.radius += ripple.velocity;
        ripple.velocity *= 0.96; // Fluid friction
        ripple.alpha *= 0.97; // Decay

        // 3D Perspective: Draw as ellipse (0.6 aspect ratio)
        // Draw multiple rings for "wave train" effect
        for (let i = 0; i < ripple.waveCount; i++) {
            const offset = i * 15; // Distance between waves
            const currentRadius = ripple.radius - offset;
            
            if (currentRadius > 0) {
                const alpha = ripple.alpha * (1 - (i * 0.3)); // Fade outer waves
                
                ctx.beginPath();
                // ellipse(x, y, radiusX, radiusY, rotation, startAngle, endAngle)
                ctx.ellipse(
                    ripple.x, 
                    ripple.y, 
                    currentRadius, 
                    currentRadius * 0.6, // 3D Tilt effect
                    0, 0, Math.PI * 2
                );

                // Complex Gradient for 3D feel (Shadow/Highlight)
                const gradient = ctx.createRadialGradient(
                    ripple.x, ripple.y - currentRadius * 0.2, currentRadius * 0.6, // Offset Y for light source illusion
                    ripple.x, ripple.y, currentRadius
                );
                
                // Fluid colors
                gradient.addColorStop(0, `hsla(${ripple.hue}, 80%, 90%, 0)`);
                gradient.addColorStop(0.5, `hsla(${ripple.hue}, 90%, 60%, ${alpha * 0.4})`);
                gradient.addColorStop(1, `hsla(${ripple.hue}, 100%, 70%, ${alpha})`); 

                ctx.strokeStyle = gradient;
                ctx.lineWidth = 2 + (ripple.velocity * 0.5); // Thicker when fast
                ctx.shadowBlur = 10;
                ctx.shadowColor = `hsla(${ripple.hue}, 100%, 50%, ${alpha})`;
                ctx.stroke();
                ctx.shadowBlur = 0; // Reset
            }
        }
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    
    resizeCanvas();
    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[9999]"
      aria-hidden="true"
      style={{ filter: 'contrast(1.2)' }} // Enhance visibility
    />
  );
}
