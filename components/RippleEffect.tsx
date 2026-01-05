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
}

export function RippleEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ripplesRef = useRef<Ripple[]>([]);
  const lastPosRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const hueRef = useRef(200); // Start with a blue-ish hue

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
      
      // Calculate speed for dynamic intensity
      let speed = 0;
      if (lastPosRef.current) {
        const dx = e.clientX - lastPosRef.current.x;
        const dy = e.clientY - lastPosRef.current.y;
        const dt = now - lastPosRef.current.time;
        speed = Math.min(Math.hypot(dx, dy) / (dt || 1), 15); // Cap speed
      }

      // Update color cycle
      hueRef.current = (hueRef.current + 1) % 360;

      // Create new ripple
      // Higher speed = larger initial ripple + faster expansion
      ripplesRef.current.push({
        x: e.clientX,
        y: e.clientY,
        radius: 2 + speed * 2,
        velocity: 2 + speed * 0.5,
        alpha: 0.8, // Higher initial opacity
        hue: hueRef.current
      });

      lastPosRef.current = { x: e.clientX, y: e.clientY, time: now };
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

      // Filter out invisible ripples
      ripplesRef.current = ripplesRef.current.filter((r) => r.alpha > 0.01);

      ripplesRef.current.forEach((ripple) => {
        // Physics: Expand and fade
        ripple.radius += ripple.velocity;
        ripple.velocity *= 0.95; // Friction slows expansion
        ripple.alpha *= 0.96; // Fade out

        ctx.beginPath();
        ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
        
        // Gradient stroke
        const gradient = ctx.createRadialGradient(
          ripple.x, ripple.y, ripple.radius * 0.7,
          ripple.x, ripple.y, ripple.radius
        );
        gradient.addColorStop(0, `hsla(${ripple.hue}, 70%, 60%, 0)`); // Inner transparent
        gradient.addColorStop(0.5, `hsla(${ripple.hue}, 80%, 60%, ${ripple.alpha * 0.5})`); // Mid color
        gradient.addColorStop(1, `hsla(${ripple.hue}, 90%, 70%, ${ripple.alpha})`); // Outer bright

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 3;
        ctx.stroke();
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
    />
  );
}
