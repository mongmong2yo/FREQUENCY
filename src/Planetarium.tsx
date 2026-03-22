import React, { useEffect, useRef } from 'react';

export default function Planetarium() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    let mwGradient: CanvasGradient;
    let nebGradient: CanvasGradient;

    // Handle resize
    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      initStars();
    };
    window.addEventListener('resize', handleResize);

    // Starfield data
    let stars: any[] = [];
    let meteors: any[] = [];
    let nebula: any = null;
    const numStars = 1000;
    let maxRadius = Math.sqrt(width * width + height * height) / 2;

    const initStars = () => {
      maxRadius = Math.sqrt(width * width + height * height) / 2;
      stars = [];

      // Pre-calculate gradients to avoid doing it every frame
      mwGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, maxRadius / 1.5);
      mwGradient.addColorStop(0, 'rgba(255, 255, 255, 0.03)');
      mwGradient.addColorStop(0.2, 'rgba(150, 200, 255, 0.015)');
      mwGradient.addColorStop(0.5, 'rgba(100, 50, 150, 0.005)');
      mwGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      nebGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, maxRadius / 2);
      nebGradient.addColorStop(0, 'rgba(255, 100, 200, 0.04)');
      nebGradient.addColorStop(0.4, 'rgba(100, 150, 255, 0.02)');
      nebGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      // Add clustered stars forming a Milky Way-like band
      const bandAngle = Math.PI / 6;
      for (let i = 0; i < 600; i++) {
        // Distance along the band
        const distAlong = (Math.random() - 0.5) * maxRadius * 2.5;
        // Distance across the band (Gaussian-like for clustering in the middle)
        const distAcross = (Math.random() + Math.random() + Math.random() - 1.5) * maxRadius * 0.2;
        
        const x = Math.cos(bandAngle) * distAlong - Math.sin(bandAngle) * distAcross;
        const y = Math.sin(bandAngle) * distAlong + Math.cos(bandAngle) * distAcross;
        
        stars.push({
          x, y,
          size: Math.random() * 1.5 + 0.2,
          alpha: Math.random(),
          twinkleSpeed: Math.random() * 0.004 + 0.001, // Slower twinkle
          twinkleDir: Math.random() > 0.5 ? 1 : -1,
          color: Math.random() > 0.7 ? '#ffb6c1' : (Math.random() > 0.5 ? '#e0ffff' : '#ffffff')
        });
      }

      for (let i = 0; i < numStars; i++) {
        // Distribute stars in a circle to allow rotation without empty corners
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * maxRadius;
        // Make stars denser towards the center (optional, but looks nice)
        const adjustedRadius = Math.pow(Math.random(), 0.8) * maxRadius;
        
        stars.push({
          x: Math.cos(angle) * adjustedRadius,
          y: Math.sin(angle) * adjustedRadius,
          size: Math.random() * 1.2 + 0.1,
          alpha: Math.random(),
          twinkleSpeed: Math.random() * 0.003 + 0.001, // Slower twinkle
          twinkleDir: Math.random() > 0.5 ? 1 : -1,
          color: Math.random() > 0.8 ? '#b0c4de' : (Math.random() > 0.5 ? '#fffafa' : '#fdf5e6')
        });
      }
    };

    initStars();

    let rotation = 0;
    let animationFrameId: number;

    const draw = () => {
      // Clear canvas with transparent background
      ctx.clearRect(0, 0, width, height);

      // Center context for rotation
      ctx.save();
      ctx.translate(width / 2, height / 2);
      
      // Slow rotation
      rotation += 0.0003;
      ctx.rotate(rotation);

      // Draw Milky Way and Nebula Band
      ctx.save();
      ctx.rotate(Math.PI / 6); // Angle the milky way relative to stars
      ctx.scale(3.5, 0.5); // Stretch it to form a band
      
      // Base Milky Way
      ctx.fillStyle = mwGradient;
      ctx.beginPath();
      ctx.arc(0, 0, maxRadius / 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Colorful Nebula Band overlapping the Milky Way
      ctx.fillStyle = nebGradient;
      ctx.beginPath();
      ctx.arc(0, 0, maxRadius / 2, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.restore();

      // Draw stars
      stars.forEach(star => {
        // Twinkle
        star.alpha += star.twinkleSpeed * star.twinkleDir;
        if (star.alpha >= 1) {
          star.alpha = 1;
          star.twinkleDir = -1;
        } else if (star.alpha <= 0.1) {
          star.alpha = 0.1;
          star.twinkleDir = 1;
        }

        ctx.globalAlpha = star.alpha;
        ctx.fillStyle = star.color;
        
        // Optimization: use fillRect for small stars instead of arc
        if (star.size < 1.5) {
          ctx.fillRect(star.x - star.size, star.y - star.size, star.size * 2, star.size * 2);
        } else {
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      ctx.restore(); // Restore from rotation

      // Draw Meteors (not rotated with stars, they just shoot across)
      if (Math.random() < 0.005 && meteors.length < 2) {
        // Spawn from top or right edge
        const spawnFromTop = Math.random() > 0.5;
        meteors.push({
          x: spawnFromTop ? Math.random() * width : width + 50,
          y: spawnFromTop ? -50 : Math.random() * height * 0.5,
          length: Math.random() * 150 + 100, // Slightly longer tail for slow meteors
          speed: Math.random() * 2 + 1.5, // Reduced speed (approx 1.5 to 3.5 px per frame)
          angle: (Math.PI / 4) + (Math.random() * 0.2 - 0.1), // roughly 45 degrees down-left
          opacity: 1
        });
      }

      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.x -= Math.cos(m.angle) * m.speed; // moving left
        m.y += Math.sin(m.angle) * m.speed; // moving down
        // 5 seconds at 60fps = 300 frames. 1 / 300 ≈ 0.0033
        m.opacity -= 0.0033;

        if (m.opacity <= 0) {
          meteors.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = m.opacity;
        const grad = ctx.createLinearGradient(m.x, m.y, m.x + Math.cos(m.angle) * m.length, m.y - Math.sin(m.angle) * m.length);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x + Math.cos(m.angle) * m.length, m.y - Math.sin(m.angle) * m.length);
        ctx.stroke();
        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ mixBlendMode: 'screen' }}
    />
  );
}
