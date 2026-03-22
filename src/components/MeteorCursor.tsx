import React, { useEffect, useRef } from 'react';

interface TrailPoint {
  x: number;
  y: number;
  age: number;
  size: number;
  hue: number;
  lightness: number;
  vx: number;
  vy: number;
}

export const MeteorCursor: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<TrailPoint[]>([]);
  const mouseRef = useRef({ x: -100, y: -100 });
  const lastMouseRef = useRef({ x: -100, y: -100 });
  const isMovingRef = useRef(false);
  const isHoveringRef = useRef(false);
  const moveTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    const onMouseMove = (e: MouseEvent) => {
      lastMouseRef.current = { ...mouseRef.current };
      mouseRef.current = { x: e.clientX, y: e.clientY };
      isMovingRef.current = true;

      if (moveTimeoutRef.current) {
        window.clearTimeout(moveTimeoutRef.current);
      }
      moveTimeoutRef.current = window.setTimeout(() => {
        isMovingRef.current = false;
      }, 50);

      // Add new trail points (Particle style)
      const dx = mouseRef.current.x - lastMouseRef.current.x;
      const dy = mouseRef.current.y - lastMouseRef.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Spawn particles based on distance moved
      const steps = Math.max(1, Math.floor(distance / 3));
      for (let i = 0; i < steps; i++) {
        const x = lastMouseRef.current.x + (dx * i) / steps;
        const y = lastMouseRef.current.y + (dy * i) / steps;
        
        // Randomize colors for the meteor tail (cyan, blue, white, purple)
        const hue = 180 + Math.random() * 100; // 180 to 280
        const lightness = 60 + Math.random() * 40; // 60 to 100
        
        pointsRef.current.push({
          x: x + (Math.random() - 0.5) * 6,
          y: y + (Math.random() - 0.5) * 6,
          age: 0,
          size: Math.random() * 2.5 + 0.5,
          hue,
          lightness,
          vx: (Math.random() - 0.5) * 0.5 - (dx * 0.015), // slight drift opposite to movement
          vy: (Math.random() - 0.5) * 0.5 - (dy * 0.015),
        });
      }
    };

    const onMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button, a, input, [role="button"], .interactive-glow')) {
        isHoveringRef.current = true;
      }
    };

    const onMouseOut = () => {
      isHoveringRef.current = false;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseover', onMouseOver);
    window.addEventListener('mouseout', onMouseOut);

    // Helper to draw a star shape
    const drawStar = (cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number) => {
      let rot = (Math.PI / 2) * 3;
      let x = cx;
      let y = cy;
      const step = Math.PI / spikes;

      ctx.beginPath();
      ctx.moveTo(cx, cy - outerRadius);
      for (let i = 0; i < spikes; i++) {
        x = cx + Math.cos(rot) * outerRadius;
        y = cy + Math.sin(rot) * outerRadius;
        ctx.lineTo(x, y);
        rot += step;

        x = cx + Math.cos(rot) * innerRadius;
        y = cy + Math.sin(rot) * innerRadius;
        ctx.lineTo(x, y);
        rot += step;
      }
      ctx.lineTo(cx, cy - outerRadius);
      ctx.closePath();
    };

    let animationFrameId: number;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const MAX_AGE = 60; // Longer than original 40 to keep a nice trail

      // Draw trail (particles)
      for (let i = pointsRef.current.length - 1; i >= 0; i--) {
        const p = pointsRef.current[i];
        p.age++;
        p.x += p.vx;
        p.y += p.vy;
        
        const life = p.age / MAX_AGE; 
        if (life >= 1) {
          pointsRef.current.splice(i, 1);
          continue;
        }

        const alpha = 1 - life;
        const colorStr = `hsla(${p.hue}, 100%, ${p.lightness}%, ${alpha})`;
        
        ctx.fillStyle = colorStr;
        
        // Optimization: Skip expensive shadowBlur for small/fading particles
        if (alpha > 0.5) {
          ctx.shadowBlur = 5;
          ctx.shadowColor = colorStr;
        } else {
          ctx.shadowBlur = 0;
        }

        const currentSize = p.size * alpha;
        if (currentSize < 1.5) {
          ctx.fillRect(p.x - currentSize, p.y - currentSize, currentSize * 2, currentSize * 2);
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, currentSize, 0, Math.PI * 2);
          ctx.fill();
        }
        
        ctx.shadowBlur = 0; // Reset
      }

      // Draw main cursor (Star head)
      if (mouseRef.current.x > -100) {
        // Calculate pulse factor for hover state (1.0 to 2.0)
        const time = Date.now();
        const pulse = isHoveringRef.current ? 1 + (Math.sin(time / 150) + 1) / 2 : 1;

        ctx.shadowBlur = isMovingRef.current ? 20 * pulse : 10 * pulse;
        ctx.shadowColor = isHoveringRef.current ? '#ffffff' : '#00ffff';
        ctx.fillStyle = '#ffffff';
        
        const baseOuter = isMovingRef.current ? 12 : 8;
        const baseInner = isMovingRef.current ? 3 : 2;

        // Draw a 4-pointed star
        drawStar(
          mouseRef.current.x, 
          mouseRef.current.y, 
          4, 
          baseOuter * pulse, 
          baseInner * pulse
        );
        ctx.fill();
        
        // Inner bright core
        ctx.shadowBlur = 0;
        drawStar(mouseRef.current.x, mouseRef.current.y, 4, 4 * pulse, 1 * pulse);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };
    render();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseover', onMouseOver);
      window.removeEventListener('mouseout', onMouseOut);
      if (moveTimeoutRef.current) window.clearTimeout(moveTimeoutRef.current);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-[9999]" />;
};
