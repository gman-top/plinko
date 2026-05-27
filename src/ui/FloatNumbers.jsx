import React, { useEffect, useRef, useState } from 'react';

/**
 * Catches `plinko-float` window events emitted by the Canvas2D scene
 * and renders short-lived "+X.XX ETH" numbers floating up from the
 * canvas coordinate. The coords are CANVAS-pixel space and the layer
 * fills the boardArea so they map 1:1.
 */
export default function FloatNumbers() {
  const layerRef = useRef(null);
  const [items, setItems] = useState([]);

  useEffect(() => {
    const onFloat = (e) => {
      const id = Math.random().toString(36).slice(2);
      const { x, y, profit, mult } = e.detail;
      setItems(prev => [...prev, { id, x, y, profit, mult }]);
      setTimeout(() => {
        setItems(prev => prev.filter(i => i.id !== id));
      }, 1600);
    };
    window.addEventListener('plinko-float', onFloat);
    return () => window.removeEventListener('plinko-float', onFloat);
  }, []);

  return (
    <div className="floatLayer" ref={layerRef}>
      {items.map(it => {
        let col = '#FFE695', glow = 'rgba(255,224,138,.85)';
        if (it.profit < 0) { col = '#8A7A5E'; glow = 'rgba(138,122,94,.4)'; }
        if (it.mult >= 50) { col = '#FF8C42'; glow = 'rgba(255,45,45,.9)'; }
        else if (it.mult >= 10) { col = '#FFB347'; glow = 'rgba(255,107,26,.85)'; }
        return (
          <div
            key={it.id}
            className="floatNum"
            style={{
              left: it.x + 'px',
              top: it.y + 'px',
              '--fnCol': col,
              '--fnGlow': glow,
            }}
          >
            {it.profit >= 0 ? '+' : ''}{it.profit.toFixed(2)} ETH
          </div>
        );
      })}
    </div>
  );
}
