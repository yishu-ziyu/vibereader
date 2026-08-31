import { useEffect, useRef } from 'react';

export default function MatrixBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    const glitchColors = ['#2b4539', '#61dca3', '#61b3dc'];
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const fontSize = 14;
    const charWidth = 9;
    const charHeight = 18;
    const glitchSpeed = 60;

    let columns = 0;
    let rows = 0;
    let letters: Array<{
      char: string;
      color: string;
      target: string;
      progress: number;
    }> = [];
    let lastGlitch = 0;
    let animId: number;

    function randChar() {
      return chars[Math.floor(Math.random() * chars.length)];
    }

    function randColor() {
      return glitchColors[Math.floor(Math.random() * glitchColors.length)];
    }

    function hexToRgb(hex: string) {
      const m = hex.replace('#', '').match(/[a-f\d]{2}/gi);
      return m
        ? { r: parseInt(m[0], 16), g: parseInt(m[1], 16), b: parseInt(m[2], 16) }
        : { r: 0, g: 0, b: 0 };
    }

    function init() {
      if (!canvas || !ctx) return;
      const parent = canvas.parentElement;
      if (!parent) return;

      const rect = parent.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      columns = Math.ceil(rect.width / charWidth);
      rows = Math.ceil(rect.height / charHeight);
      const total = columns * rows;

      letters = Array.from({ length: total }, () => ({
        char: randChar(),
        color: randColor(),
        target: randColor(),
        progress: 1,
      }));
    }

    function draw() {
      if (!canvas || !ctx) return;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      ctx.clearRect(0, 0, w, h);
      ctx.font = `${fontSize}px monospace`;
      ctx.textBaseline = 'top';

      for (let i = 0; i < letters.length; i++) {
        const x = (i % columns) * charWidth;
        const y = Math.floor(i / columns) * charHeight;
        ctx.fillStyle = letters[i].color;
        ctx.fillText(letters[i].char, x, y);
      }
    }

    function update() {
      const count = Math.max(1, Math.floor(letters.length * 0.05));
      for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * letters.length);
        if (letters[idx]) {
          letters[idx].char = randChar();
          letters[idx].target = randColor();
          letters[idx].progress = 0;
        }
      }

      // Smooth color transitions
      let needsDraw = false;
      for (const l of letters) {
        if (l.progress < 1) {
          l.progress = Math.min(1, l.progress + 0.06);
          const from = hexToRgb(l.color);
          const to = hexToRgb(l.target);
          l.color = `rgb(${Math.round(from.r + (to.r - from.r) * l.progress)},${Math.round(
            from.g + (to.g - from.g) * l.progress
          )},${Math.round(from.b + (to.b - from.b) * l.progress)})`;
          needsDraw = true;
        }
      }
      if (needsDraw) draw();
    }

    function animate(ts: number) {
      if (ts - lastGlitch >= glitchSpeed) {
        update();
        draw();
        lastGlitch = ts;
      }
      animId = requestAnimationFrame(animate);
    }

    init();
    animId = requestAnimationFrame(animate);

    let resizeTimer: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        cancelAnimationFrame(animId);
        init();
        animId = requestAnimationFrame(animate);
      }, 200);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimer);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        opacity: 0.3,
        display: 'block',
      }}
    />
  );
}
