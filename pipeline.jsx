/* eslint-disable */
/* global React */
/* PipelineDAG — full-page DAG that IS the portfolio.
   5 lanes (SOURCES → PROCESSING → MARTS → QUALITY → SHIP).
   Click a node → focus mode (camera zoom + drawer with details).
*/

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ============================================================
//  MOBILE DETECTION HOOK
// ============================================================
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(max-width: 720px)').matches
      : false
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 720px)');
    const onChange = (e) => setIsMobile(e.matches);
    try { mq.addEventListener('change', onChange); }
    catch (_) { mq.addListener(onChange); }
    return () => {
      try { mq.removeEventListener('change', onChange); }
      catch (_) { mq.removeListener(onChange); }
    };
  }, []);
  return isMobile;
}

// ============================================================
//  LAYOUT CONSTANTS
// ============================================================
const LANES = ['SOURCES', 'PROCESSING', 'MARTS', 'QUALITY', 'SHIP'];
const LANE_W = 380;          // svg units per lane
const LANE_GAP = 60;
const ROW_H = 110;
const ROW_GAP_TOP = 100;     // top padding inside svg
const NODE_W = { source: 220, tool: 240, project: 290, cert: 290, ship_cta: 240 };
const NODE_H = { source: 70, tool: 72, project: 118, cert: 82, ship_cta: 100 };

const STAGE_PAD_X = 80;

function laneIndex(name) { return LANES.indexOf(name); }

// Compute (x, y, w, h) for each node in svg coords
function layoutNodes(nodes) {
  return nodes.map(n => {
    const li = laneIndex(n.lane);
    const w = NODE_W[n.type] || 200;
    const h = NODE_H[n.type] || 60;
    const cx = STAGE_PAD_X + li * (LANE_W + LANE_GAP) + LANE_W / 2;
    const cy = ROW_GAP_TOP + n.row * ROW_H + h / 2;
    return {
      ...n,
      x: cx - w / 2,
      y: cy - h / 2,
      w, h,
      cx, cy,
    };
  });
}

// total svg dimensions
function stageSize(nodes) {
  const width = STAGE_PAD_X * 2 + LANES.length * LANE_W + (LANES.length - 1) * LANE_GAP;
  let maxRow = 0;
  nodes.forEach(n => { if (n.row > maxRow) maxRow = n.row; });
  const height = ROW_GAP_TOP + (maxRow + 1) * ROW_H + 60;
  return { width, height };
}

// ============================================================
//  EDGES — bezier paths between nodes
// ============================================================
function edgePath(a, b) {
  const x1 = a.x + a.w; // right side of source
  const y1 = a.cy;
  const x2 = b.x;       // left side of target
  const y2 = b.cy;
  const dx = Math.max(60, (x2 - x1) * 0.5);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

// ============================================================
//  ICONS
// ============================================================
const ICONS = {
  person: <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />,
  book: <path d="M19 2H8c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 16H9V4h9v14z" />,
  briefcase: <path d="M20 6h-4V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6 0h-4V4h4v2z" />,
  download: <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />,
  mail: <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />,
  code: <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z" />,
  link: <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />,
};

function NodeIcon({ name, size = 14 }) {
  if (!ICONS[name]) return null;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      {ICONS[name]}
    </svg>
  );
}

// ============================================================
//  NODE RENDERER (SVG foreignObject for HTML content)
// ============================================================
function PipelineNode({ node, isFocused, isDimmed, isUnlinkedPrimary, onClick, lang }) {
  const title = lang === 'fr' ? (node.title_fr || node.label) : (node.title_en || node.label);
  const summary = lang === 'fr' ? node.summary_fr : node.summary_en;
  const isPrimary = node.primary === true;

  let className = 'pnode pnode-' + node.type;
  if (isFocused) className += ' is-focused';
  if (isDimmed) className += ' is-dimmed';
  if (isPrimary) className += ' is-primary';
  if (isUnlinkedPrimary) className += ' is-unlinked-primary';

  return (
    <foreignObject x={node.x} y={node.y} width={node.w} height={node.h} style={{ overflow: 'visible' }}>
      <div className={className} data-node-id={node.id} onClick={(e) => { e.stopPropagation(); onClick(node); }}>
        {node.type === 'project' ? (
          <ProjectNodeContent node={node} title={title} summary={summary} lang={lang}/>
        ) : node.type === 'tool' ? (
          <ToolNodeContent node={node} title={title} lang={lang}/>
        ) : node.type === 'source' ? (
          <SourceNodeContent node={node} title={title} summary={summary} lang={lang}/>
        ) : node.type === 'cert' ? (
          <CertNodeContent node={node} title={title} lang={lang}/>
        ) : node.type === 'ship_cta' ? (
          <ShipCtaNodeContent node={node} title={title} lang={lang}/>
        ) : null}
      </div>
    </foreignObject>
  );
}

function SourceNodeContent({ node, title, summary }) {
  return (
    <>
      <div className="pn-head">
        <span className="pn-icon"><NodeIcon name={node.icon}/></span>
        <span className="pn-label">{node.label}</span>
      </div>
      <div className="pn-title">{title}</div>
    </>
  );
}

function ToolNodeContent({ node, title }) {
  return (
    <>
      <div className="pn-head">
        <span className="pn-label">{node.label}</span>
        <span className="pn-level">lvl {node.level}</span>
      </div>
      <div className="pn-title">{title}</div>
      <div className="pn-bar"><div style={{width: node.level + '%'}}/></div>
    </>
  );
}

function ProjectNodeContent({ node, title, summary }) {
  return (
    <>
      <div className="pn-head">
        <span className="pn-kanji">{node.kanji}</span>
        <span className="pn-label">{node.label}</span>
        <span className="pn-year">{node.year}</span>
      </div>
      <div className="pn-title">{title}</div>
      <div className="pn-stack">
        {(node.stack || []).slice(0,3).map(s => <span key={s} className="pn-chip">{s}</span>)}
      </div>
    </>
  );
}

function CertNodeContent({ node, title }) {
  const isCertified = node.status === 'certified';
  return (
    <>
      <div className="pn-head">
        <span className={'pn-status ' + (isCertified ? 'ok' : 'wip')}/>
        <span className="pn-label">{node.label}</span>
      </div>
      <div className="pn-title">{title}</div>
    </>
  );
}

function ShipCtaNodeContent({ node, title }) {
  return (
    <>
      <div className="pn-head">
        <span className="pn-icon"><NodeIcon name={node.icon} size={16}/></span>
        <span className="pn-label">{node.label}</span>
      </div>
      <div className="pn-title">{title}</div>
      <span className="pn-cta-arrow">→</span>
    </>
  );
}

// ============================================================
//  TOOL CHILDREN CLUSTER — chips that appear around a focused tool node
// ============================================================
function ToolChildrenCluster({ node }) {
  const kids = node.children || [];
  // Arrange chips on a vertical column to the LEFT of the tool node
  // (the "upstream / feeds into" direction)
  const chipW = 170;
  const chipH = 34;
  const gap = 10;
  const colX = node.x - chipW - 48; // 48 px gap with connector
  const totalH = kids.length * chipH + (kids.length - 1) * gap;
  const startY = node.cy - totalH / 2;

  return (
    <g className="tool-children-cluster">
      {kids.map((c, i) => {
        const cx = colX;
        const cy = startY + i * (chipH + gap);
        // bezier from chip right edge → tool node left edge
        const x1 = cx + chipW;
        const y1 = cy + chipH / 2;
        const x2 = node.x;
        const y2 = node.cy;
        const dx = Math.max(30, (x2 - x1) * 0.5);
        const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
        const delay = (i * 0.06).toFixed(2);
        return (
          <g key={c.label} className="tcc-item" style={{ animationDelay: delay + 's' }}>
            <path d={path} className="tcc-edge" fill="none"/>
            <foreignObject x={cx} y={cy} width={chipW} height={chipH} style={{ overflow: 'visible' }}>
              <div className="tcc-chip">
                <span className="tcc-chip-label">{c.label}</span>
                {typeof c.level === 'number' && (
                  <span className="tcc-chip-bar">
                    <span className="tcc-chip-bar-fill" style={{ width: c.level + '%' }}/>
                  </span>
                )}
              </div>
            </foreignObject>
          </g>
        );
      })}
    </g>
  );
}

// ============================================================
//  EDGES RENDERER with flow particles on important paths
// ============================================================
function PipelineEdges({ nodes, edges, focusedId, importantTargetIds }) {
  const byId = useMemo(() => {
    const m = {};
    nodes.forEach(n => { m[n.id] = n; });
    return m;
  }, [nodes]);

  return (
    <g className="pipeline-edges">
      {edges.map(([a, b], i) => {
        const A = byId[a]; const B = byId[b];
        if (!A || !B) return null;
        const path = edgePath(A, B);
        const isFocused = focusedId === a || focusedId === b;
        const isImportant = importantTargetIds.includes(b);
        const dim = focusedId && !isFocused;

        let cls = 'pipe-edge';
        if (isFocused) cls += ' is-focused';
        if (dim) cls += ' is-dimmed';
        if (isImportant) cls += ' is-important';

        return (
          <g key={i} className={cls}>
            <path d={path} fill="none"/>
            {isImportant && !dim && (
              <circle r="3" className="pipe-particle">
                <animateMotion dur="2.4s" repeatCount="indefinite" path={path}/>
              </circle>
            )}
            {isFocused && (
              <circle r="4" className="pipe-particle pipe-particle-focused">
                <animateMotion dur="1.2s" repeatCount="indefinite" path={path}/>
              </circle>
            )}
          </g>
        );
      })}
    </g>
  );
}

// ============================================================
//  MAIN COMPONENT
// ============================================================

// Clamp a candidate {tx, ty, s} so the user can't pan/zoom too far
// outside the stage. Rules:
//   - scale stays in [minScale, maxScale]
//   - viewport-center in world coords stays inside the stage bounds with a
//     soft margin (so a little overscroll feels natural but you can't drift off)
function clampView(v, stageEl, stageW, stageH, isMobile) {
  if (!stageEl) return v;
  const rect = stageEl.getBoundingClientRect();
  const minScale = 0.15;
  const maxScale = isMobile ? 2.2 : 3;
  const s = Math.min(Math.max(v.s, minScale), maxScale);
  // Reserved chrome on mobile (topbar 48 + bottom bar 72 + right sidebar 44)
  const padTop    = isMobile ? 48 : 0;
  const padBottom = isMobile ? 72 : 0;
  const padRight  = isMobile ? 44 : 0;
  const usableW = rect.width - padRight;
  const usableH = rect.height - padTop - padBottom;
  // Overscroll margin (px in screen space): mobile = tight, desktop = generous
  // so the user can pan to inspect a focused node's full connection fan-out.
  const overscroll = isMobile ? 60 : 320;
  // Viewport-center coordinates in *world* space must stay inside an
  // expanded stage rect [-overscroll, stageW+overscroll].
  // World-x at viewport center = (usableW/2 + padRight*0 - tx) / s
  // To keep that >= -overscroll: tx <= usableW/2 + overscroll * s
  // To keep that <= stageW + overscroll: tx >= usableW/2 - (stageW + overscroll) * s
  const vCenterX = usableW / 2;
  const vCenterY = padTop + usableH / 2;
  const txMax = vCenterX + overscroll * s;
  const txMin = vCenterX - (stageW + overscroll) * s;
  const tyMax = vCenterY + overscroll * s;
  const tyMin = vCenterY - (stageH + overscroll) * s;
  let tx = Math.min(Math.max(v.tx, txMin), txMax);
  let ty = Math.min(Math.max(v.ty, tyMin), tyMax);
  return { tx, ty, s };
}

// Compute fit-to-view transform
function computeFitView(stageEl, stageW, stageH, isMobile) {
  if (!stageEl) return { tx: 0, ty: 0, s: 1 };
  const rect = stageEl.getBoundingClientRect();
  if (isMobile) {
    // Reserve space for: 48px topbar, 72px bottom bar, 44px right sidebar
    const usableW = rect.width - 44;
    const usableH = rect.height - 48 - 72;
    // Fit by HEIGHT so all 5 lanes are visible vertically scaled down,
    // but cap scale so nodes don't become unreadable. User pans horizontally.
    const sy = usableH / stageH;
    const sx = usableW / stageW;
    // Start zoomed to ~fit-height with some breathing room, or fit-both whichever smaller
    const s = Math.min(Math.max(Math.min(sx, sy) * 0.95, 0.18), 0.55);
    // Center vertically in usable area, start at left of stage with small offset
    const tx = 20;
    const ty = 48 + (usableH - stageH * s) / 2;
    return { tx, ty, s };
  }
  const sx = rect.width / stageW;
  const sy = rect.height / stageH;
  const s = Math.min(sx, sy) * 0.9;
  const tx = (rect.width - stageW * s) / 2;
  const ty = (rect.height - stageH * s) / 2;
  return { tx, ty, s };
}

// Compute focus transform centered on a node
function computeFocusView(stageEl, node, fitScale) {
  if (!stageEl || !node) return { tx: 0, ty: 0, s: fitScale };
  const rect = stageEl.getBoundingClientRect();
  const s = Math.min(Math.max(fitScale * 1.6, 0.7), 1.3);
  const tx = rect.width / 2 - node.cx * s;
  const ty = rect.height / 2 - node.cy * s;
  return { tx, ty, s };
}

function PipelinePortfolio({ data, lang, onSwitchClassic }) {
  const isMobile = useIsMobile();
  const [focusedId, setFocusedId] = useState(null);
  const [view, setView] = useState({ tx: 0, ty: 0, s: 1 });
  const [animating, setAnimating] = useState(false);
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const pinchRef = useRef(null);

  const positioned = useMemo(() => layoutNodes(data.nodes), [data.nodes]);
  const stage = useMemo(() => stageSize(data.nodes), [data.nodes]);
  const byId = useMemo(() => {
    const m = {};
    positioned.forEach(n => { m[n.id] = n; });
    return m;
  }, [positioned]);

  const focusedNode = focusedId ? byId[focusedId] : null;

  // important = SHIP nodes flagged primary (CV, Contact)
  const importantTargetIds = useMemo(
    () => positioned.filter(n => n.type === 'ship_cta' && n.primary).map(n => n.id),
    [positioned]
  );

  // Initial fit + on-resize fit (only when not focused & user hasn't manually panned)
  const [hasUserMoved, setHasUserMoved] = useState(false);

  // Always pass camera updates through the clamp so the user can't pan/zoom
  // too far outside the DAG.
  const setClampedView = useCallback((updater) => {
    setView(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      return clampView(next, stageRef.current, stage.width, stage.height, isMobile);
    });
  }, [stage.width, stage.height, isMobile]);
  useEffect(() => {
    function fit() {
      if (!stageRef.current) return;
      if (focusedId || hasUserMoved) return;
      const v = computeFitView(stageRef.current, stage.width, stage.height, isMobile);
      setView(clampView(v, stageRef.current, stage.width, stage.height, isMobile));
    }
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [stage.width, stage.height, focusedId, hasUserMoved, isMobile]);

  // Focus does NOT zoom anymore — keep current camera, just highlight + open drawer
  // (kept the effect slot in case we need a subtle nudge later)

  // Reset to fit
  const fitToView = useCallback(() => {
    if (!stageRef.current) return;
    const v = computeFitView(stageRef.current, stage.width, stage.height, isMobile);
    setAnimating(true);
    setView(clampView(v, stageRef.current, stage.width, stage.height, isMobile));
    setHasUserMoved(false);
    setTimeout(() => setAnimating(false), 500);
  }, [stage.width, stage.height, isMobile]);

  // Wheel: zoom around cursor by default; trackpad horizontal swipe pans.
  // Also touch: 2-finger pinch zoom + 2-finger pan.
  // Refs mirror state so native listeners (registered once) always read latest values.
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);
  const focusedIdRef = useRef(focusedId);
  useEffect(() => { focusedIdRef.current = focusedId; }, [focusedId]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    function onWheel(e) {
      e.preventDefault();
      setAnimating(false);
      setHasUserMoved(true);
      // Trackpad horizontal swipe (deltaX dominant) → pan horizontally
      // Otherwise → zoom around the cursor. Ctrl/Cmd also forces zoom.
      const horizontalIntent =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) && !e.ctrlKey && !e.metaKey;
      if (horizontalIntent) {
        setClampedView(v => ({ tx: v.tx - e.deltaX, ty: v.ty - e.deltaY, s: v.s }));
        return;
      }
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setClampedView(v => {
        const factor = Math.exp(-e.deltaY * 0.0015);
        const newS = Math.min(Math.max(v.s * factor, 0.15), 3);
        const wx = (mx - v.tx) / v.s;
        const wy = (my - v.ty) / v.s;
        const tx = mx - wx * newS;
        const ty = my - wy * newS;
        return { tx, ty, s: newS };
      });
    }

    // ----- Touch handlers for pinch-zoom + 2-finger pan -----
    function dist(a, b) {
      const dx = a.clientX - b.clientX;
      const dy = a.clientY - b.clientY;
      return Math.hypot(dx, dy);
    }
    function midpoint(a, b, rect) {
      return {
        x: (a.clientX + b.clientX) / 2 - rect.left,
        y: (a.clientY + b.clientY) / 2 - rect.top,
      };
    }
    function onTouchStart(e) {
      if (e.touches.length === 2) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        pinchRef.current = {
          startDist: dist(e.touches[0], e.touches[1]),
          startMid: midpoint(e.touches[0], e.touches[1], rect),
          startView: { ...viewRef.current },
        };
        // cancel any 1-finger drag
        dragRef.current = null;
      }
    }
    function onTouchMove(e) {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const d = dist(e.touches[0], e.touches[1]);
        const m = midpoint(e.touches[0], e.touches[1], rect);
        const { startDist, startMid, startView } = pinchRef.current;
        const factor = d / startDist;
        const newS = Math.min(Math.max(startView.s * factor, 0.12), 3);
        // anchor: keep the original midpoint stationary in world space,
        // then translate by mid-mid (so 2-finger drag pans)
        const wx = (startMid.x - startView.tx) / startView.s;
        const wy = (startMid.y - startView.ty) / startView.s;
        const tx = m.x - wx * newS;
        const ty = m.y - wy * newS;
        setAnimating(false);
        setHasUserMoved(true);
        setClampedView({ tx, ty, s: newS });
      }
    }
    function onTouchEnd(e) {
      if (e.touches.length < 2) pinchRef.current = null;
    }

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: false });
    el.addEventListener('touchcancel', onTouchEnd, { passive: false });

    // ----- Pointer drag-to-pan (native listeners — bypasses React delegation) -----
    function onPointerDownNative(e) {
      if (e.target.closest('.pnode') ||
          e.target.closest('.pipeline-drawer') ||
          e.target.closest('.pipeline-topbar') ||
          e.target.closest('.pipeline-controls') ||
          e.target.closest('.mobile-lane-sidebar') ||
          e.target.closest('.mobile-bottom-bar') ||
          e.target.closest('.pipeline-hints')) return;
      // ignore right-click + secondary buttons; touch pinch handled separately
      if (e.button !== undefined && e.button !== 0) return;
      if (e.pointerType === 'touch' && pinchRef.current) return;
      dragRef.current = {
        x: e.clientX,
        y: e.clientY,
        // read view via the ref-style global we update on every render
        vx: viewRef.current.tx,
        vy: viewRef.current.ty,
        moved: false,
        started: true,
      };
      el.style.cursor = 'grabbing';
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
    }
    function onPointerMoveNative(e) {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
      setAnimating(false);
      setHasUserMoved(true);
      setClampedView({
        tx: dragRef.current.vx + dx,
        ty: dragRef.current.vy + dy,
        s: viewRef.current.s,
      });
    }
    function onPointerUpNative(e) {
      const ref = dragRef.current;
      dragRef.current = null;
      el.style.cursor = 'grab';
      if (ref && ref.started && !ref.moved && focusedIdRef.current) {
        setFocusedId(null);
      }
    }
    el.addEventListener('pointerdown', onPointerDownNative);
    window.addEventListener('pointermove', onPointerMoveNative);
    window.addEventListener('pointerup', onPointerUpNative);
    window.addEventListener('pointercancel', onPointerUpNative);

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      el.removeEventListener('pointerdown', onPointerDownNative);
      window.removeEventListener('pointermove', onPointerMoveNative);
      window.removeEventListener('pointerup', onPointerUpNative);
      window.removeEventListener('pointercancel', onPointerUpNative);
    };
  }, [setClampedView]);

  // Zoom buttons
  const zoomBy = useCallback((factor) => {
    if (!stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const mx = rect.width / 2;
    const my = rect.height / 2;
    setAnimating(true);
    setHasUserMoved(true);
    setClampedView(v => {
      const newS = Math.min(Math.max(v.s * factor, 0.15), 3);
      const wx = (mx - v.tx) / v.s;
      const wy = (my - v.ty) / v.s;
      return { tx: mx - wx * newS, ty: my - wy * newS, s: newS };
    });
    setTimeout(() => setAnimating(false), 300);
  }, []);

  // Center camera on a given lane (mobile sidebar interaction)
  // — and zoom in so the lane fills the viewport comfortably.
  const scrollToLane = useCallback((laneName) => {
    if (!stageRef.current) return;
    const li = laneIndex(laneName);
    if (li < 0) return;
    const laneCx = STAGE_PAD_X + li * (LANE_W + LANE_GAP) + LANE_W / 2;
    // Find first node in this lane for vertical centering, else use stage middle
    const laneNodes = positioned.filter(n => n.lane === laneName);
    const laneCy = laneNodes.length
      ? laneNodes.reduce((s, n) => s + n.cy, 0) / laneNodes.length
      : stage.height / 2;
    const rect = stageRef.current.getBoundingClientRect();
    const padTop    = isMobile ? 48 : 0;
    const padBottom = isMobile ? 72 : 0;
    const padRight  = isMobile ? 44 : 0;
    const usableW = rect.width - padRight;
    const usableH = rect.height - padTop - padBottom;
    // Target scale: fit ~1.3 lanes horizontally so the focused lane fills the
    // screen with a sliver of the neighbour visible (helps with orientation).
    const targetScale = isMobile
      ? Math.min(Math.max(usableW / (LANE_W * 1.3), 0.55), 0.9)
      : Math.min(Math.max(usableW / (LANE_W * 2.4), 0.85), 1.4);
    setClampedView(() => {
      const s = targetScale;
      const tx = (usableW / 2) - laneCx * s;
      const ty = padTop + (usableH / 2) - laneCy * s;
      return { tx, ty, s };
    });
    setAnimating(true);
    setHasUserMoved(true);
    setTimeout(() => setAnimating(false), 500);
  }, [positioned, stage.height, isMobile, setClampedView]);

  // Active lane (mobile sidebar highlight) — based on which lane center is
  // closest to viewport center
  const activeLane = useMemo(() => {
    if (!isMobile || !stageRef.current) return null;
    const rect = stageRef.current.getBoundingClientRect();
    const screenCxWorld = (rect.width / 2 - view.tx) / view.s;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < LANES.length; i++) {
      const cx = STAGE_PAD_X + i * (LANE_W + LANE_GAP) + LANE_W / 2;
      const d = Math.abs(cx - screenCxWorld);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    return LANES[bestIdx];
  }, [view.tx, view.s, isMobile]);

  const cam = view;

  // Edges connected to focused node
  const adjIds = useMemo(() => {
    if (!focusedId) return new Set();
    const set = new Set([focusedId]);
    data.edges.forEach(([a, b]) => {
      if (a === focusedId) set.add(b);
      if (b === focusedId) set.add(a);
    });
    return set;
  }, [focusedId, data.edges]);

  // Keyboard
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && focusedId) setFocusedId(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusedId]);

  return (
    <div className="pipeline-stage"
         ref={stageRef}>
      <AkiraBackground/>
      <PipelineTopbar
        lang={lang}
        focusedNode={focusedNode}
        onSwitchClassic={onSwitchClassic}
        onClearFocus={() => setFocusedId(null)}
      />

      <div className="pipeline-canvas"
           style={{
             transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.s})`,
             transformOrigin: '0 0',
             transition: animating ? 'transform 0.6s cubic-bezier(0.65, 0, 0.35, 1)' : 'none',
           }}>
        <svg width={stage.width} height={stage.height} viewBox={`0 0 ${stage.width} ${stage.height}`}>
          <defs>
            <pattern id="dag-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="var(--ink-faint)" strokeWidth="0.5" opacity="0.4"/>
            </pattern>
          </defs>
          <rect width={stage.width} height={stage.height} fill="url(#dag-grid)" opacity="0.4"/>

          {/* lane labels */}
          {LANES.map((lane, i) => (
            <g key={lane}>
              <text x={STAGE_PAD_X + i * (LANE_W + LANE_GAP) + LANE_W / 2}
                    y={50}
                    textAnchor="middle"
                    className="lane-label">
                {lane}
              </text>
              <line x1={STAGE_PAD_X + i * (LANE_W + LANE_GAP)}
                    x2={STAGE_PAD_X + i * (LANE_W + LANE_GAP) + LANE_W}
                    y1={66} y2={66}
                    className="lane-rule"/>
            </g>
          ))}

          <PipelineEdges
            nodes={positioned}
            edges={data.edges}
            focusedId={focusedId}
            importantTargetIds={importantTargetIds}
          />

          {positioned.map(node => {
            const isPrimaryShip = node.type === 'ship_cta' && node.primary;
            const isUnlinkedPrimary = isPrimaryShip && focusedId && !adjIds.has(node.id);
            return (
              <PipelineNode
                key={node.id}
                node={node}
                lang={lang}
                isFocused={focusedId === node.id}
                isDimmed={focusedId && !adjIds.has(node.id) && !isPrimaryShip}
                isUnlinkedPrimary={isUnlinkedPrimary}
                onClick={(n) => setFocusedId(n.id)}
              />
            );
          })}

          {/* Children chips for the focused tool node */}
          {focusedNode && focusedNode.type === 'tool' && focusedNode.children && (
            <ToolChildrenCluster node={focusedNode}/>
          )}
        </svg>
      </div>

      <PipelineHints visible={!focusedId && !isMobile}/>
      <PipelineControls onFit={fitToView} onZoomIn={() => zoomBy(1.25)} onZoomOut={() => zoomBy(0.8)} scale={view.s}/>
      {isMobile && (
        <MobileLaneSidebar
          activeLane={activeLane}
          onLaneClick={scrollToLane}
        />
      )}
      {isMobile && (
        <MobileBottomBar
          nodes={positioned}
          lang={lang}
          onNodeClick={(id) => setFocusedId(id)}
        />
      )}
      {isMobile && !focusedId && <MobilePinchHint lang={lang}/>}
      <PipelineDrawer node={focusedNode} lang={lang} onClose={() => setFocusedId(null)}/>
    </div>
  );
}

// ============================================================
//  MOBILE — Lane sidebar (right edge, vertical labels)
// ============================================================
function MobileLaneSidebar({ activeLane, onLaneClick }) {
  return (
    <div className="mobile-lane-sidebar" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {LANES.map((lane, i) => (
        <button
          key={lane}
          className={'mls-item' + (activeLane === lane ? ' is-active' : '')}
          onClick={() => onLaneClick(lane)}
        >
          <span className="mls-num">{String(i + 1).padStart(2, '0')}</span>
          <span className="mls-label">{lane}</span>
        </button>
      ))}
    </div>
  );
}

// ============================================================
//  MOBILE — Bottom CTA bar (primary ship_cta nodes)
// ============================================================
function MobileBottomBar({ nodes, lang, onNodeClick }) {
  const primaries = nodes.filter(n => n.type === 'ship_cta' && n.primary);
  if (!primaries.length) return null;
  return (
    <div className="mobile-bottom-bar" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {primaries.map((n, i) => {
        const title = lang === 'fr' ? (n.title_fr || n.label) : (n.title_en || n.label);
        return (
          <button
            key={n.id}
            className={'mbb-btn' + (i === 0 ? ' is-primary' : '')}
            onClick={() => onNodeClick(n.id)}
          >
            <span className="mbb-label">{n.label}</span>
            <span className="mbb-title">
              {title}
              <span className="mbb-arrow">→</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
//  MOBILE — One-time pinch hint
// ============================================================
function MobilePinchHint({ lang }) {
  return (
    <div className="mobile-pinch-hint" key="mph">
      <span className="mph-icon"/>
      <span>{lang === 'fr' ? 'pincez pour zoomer · tapez un nœud' : 'pinch to zoom · tap any node'}</span>
    </div>
  );
}

// ============================================================
//  CONTROLS (zoom buttons / fit)
// ============================================================
function PipelineControls({ onFit, onZoomIn, onZoomOut, scale }) {
  return (
    <div className="pipeline-controls" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <button className="pc-btn" onClick={onZoomIn} aria-label="Zoom in">+</button>
      <div className="pc-scale">{Math.round(scale * 100)}%</div>
      <button className="pc-btn" onClick={onZoomOut} aria-label="Zoom out">−</button>
      <button className="pc-btn pc-fit" onClick={onFit} aria-label="Fit to view" title="Fit">⛶</button>
    </div>
  );
}

// ============================================================
//  AKIRA BACKGROUND — Neo-Tokyo ambient layer
// ============================================================
function AkiraBackground() {
  // Generate katakana rain columns once
  const columns = useMemo(() => {
    const kata = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789';
    return Array.from({ length: 28 }, (_, i) => {
      const chars = Array.from({ length: 18 }, () => kata[Math.floor(Math.random() * kata.length)]).join('\n');
      return {
        left: (i / 28) * 100 + (Math.random() - 0.5) * 3,
        chars,
        delay: -Math.random() * 14,
        duration: 12 + Math.random() * 10,
        opacity: 0.04 + Math.random() * 0.08,
      };
    });
  }, []);

  return (
    <div className="akira-bg" aria-hidden="true">
      <div className="akira-base"/>
      <div className="akira-rain">
        {columns.map((c, i) => (
          <div key={i} className="akira-rain-col"
               style={{
                 left: c.left + '%',
                 animationDelay: c.delay + 's',
                 animationDuration: c.duration + 's',
                 opacity: c.opacity,
               }}>
            {c.chars}
          </div>
        ))}
      </div>
      <svg className="akira-skyline" viewBox="0 0 1600 280" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0a0d18" stopOpacity="0"/>
            <stop offset="60%" stopColor="#0a0d18" stopOpacity="0.85"/>
            <stop offset="100%" stopColor="#000" stopOpacity="1"/>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="1600" height="280" fill="url(#skyGrad)"/>
        <g fill="#000" stroke="#1a2030" strokeWidth="1">
          <polygon points="0,280 0,180 30,180 30,140 60,140 60,170 90,170 90,200 130,200 130,150 160,150 160,180 200,180 200,160 240,160 240,210 280,210 280,170 320,170 320,140 360,140 360,180 400,180 400,210 440,210 440,170 480,170 480,200 520,200 520,150 560,150 560,180 610,180 610,200 650,200 650,160 690,160 690,180 730,180 730,210 770,210 770,170 810,170 810,140 850,140 850,180 890,180 890,200 930,200 930,160 970,160 970,190 1010,190 1010,170 1050,170 1050,200 1090,200 1090,150 1140,150 1140,180 1180,180 1180,210 1220,210 1220,170 1260,170 1260,150 1300,150 1300,200 1340,200 1340,170 1380,170 1380,200 1420,200 1420,170 1470,170 1470,140 1510,140 1510,180 1550,180 1550,200 1600,200 1600,280"/>
        </g>
        {/* Antenna lights */}
        <g>
          <circle cx="160" cy="150" r="1.5" fill="#ff2a3b" className="sky-light sky-light-r"/>
          <circle cx="480" cy="170" r="1.5" fill="#2effff" className="sky-light sky-light-c"/>
          <circle cx="850" cy="140" r="1.8" fill="#ff2a3b" className="sky-light sky-light-r"/>
          <circle cx="1140" cy="150" r="1.5" fill="#2effff" className="sky-light sky-light-c"/>
          <circle cx="1470" cy="140" r="1.5" fill="#ff2a3b" className="sky-light sky-light-r"/>
        </g>
      </svg>
      <div className="akira-scanlines"/>
      <div className="akira-vignette"/>
      <div className="akira-neon akira-neon-r"/>
      <div className="akira-neon akira-neon-c"/>
    </div>
  );
}

// ============================================================
//  TOPBAR
// ============================================================
function PipelineTopbar({ lang, focusedNode, onSwitchClassic, onClearFocus }) {
  return (
    <div className="pipeline-topbar" onClick={(e) => e.stopPropagation()}>
      <div className="ptb-left">
        <span className="ptb-dot"/>
        <span className="ptb-mark">JBA</span>
        <span className="ptb-divider">·</span>
        <span className="ptb-title">analytics_engineer.dag</span>
      </div>
      <div className="ptb-center">
        {focusedNode ? (
          <div className="ptb-breadcrumb">
            <button className="ptb-btn-link" onClick={onClearFocus}>← all nodes</button>
            <span className="ptb-divider">/</span>
            <span className="ptb-current">{focusedNode.label}</span>
          </div>
        ) : (
          <span className="ptb-status">
            <span className="ptb-pulse"/>
            {lang === 'fr' ? 'pipeline · live · cliquez un nœud' : 'pipeline · live · click any node'}
          </span>
        )}
      </div>
      <div className="ptb-right">
        <image-slot
          id="profile"
          shape="circle"
          class="topbar-avatar"
          placeholder="Photo"
          fit="cover"
          src="assets/profile.jpg"
        />
      </div>
    </div>
  );
}

// ============================================================
//  HINTS (overlay help when no focus)
// ============================================================
function PipelineHints({ visible }) {
  if (!visible) return null;
  return (
    <div className="pipeline-hints">
      <div className="ph-corner ph-bl">
        <div className="ph-key">esc</div>
        <span>fermer focus</span>
      </div>
      <div className="ph-corner ph-br">
        <span>scroll · zoom · drag · pan</span>
      </div>
    </div>
  );
}

// ============================================================
//  Rich text renderer — splits on \n\n into paragraphs,
//  converts **text** into <strong>
// ============================================================
function renderRichText(text) {
  if (!text) return null;
  const paragraphs = String(text).split(/\n\s*\n/);
  return paragraphs.map((para, pi) => {
    const parts = para.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    return (
      <p key={pi} className="pdr-rich-p">
        {parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i}>{part.slice(2, -2)}</strong>;
          }
          return <React.Fragment key={i}>{part}</React.Fragment>;
        })}
      </p>
    );
  });
}

// ============================================================
//  DRAWER (side panel with full details on focused node)
// ============================================================
function PipelineDrawer({ node, lang, onClose }) {
  if (!node) return null;
  const title = lang === 'fr' ? (node.title_fr || node.label) : (node.title_en || node.label);
  const summary = lang === 'fr' ? node.summary_fr : node.summary_en;
  const body = lang === 'fr' ? node.body_fr : node.body_en;

  return (
    <div className="pipeline-drawer" onClick={(e) => e.stopPropagation()}>
      <div className="pdr-head">
        <div className="pdr-eyebrow">
          <span className={'pdr-type-tag pdr-type-' + node.type}>{node.type.replace('_', ' ')}</span>
          <span className="pdr-id">{node.id}</span>
        </div>
        <button className="pdr-close" onClick={onClose} aria-label="Close"><span className="pdr-close-x">✕</span></button>
      </div>

      <div className="pdr-title-block">
        {node.kanji && <div className="pdr-kanji">{node.kanji}</div>}
        <h2>{title}</h2>
        {summary && <p className="pdr-summary">{summary}</p>}
      </div>

      <div className="pdr-body">
        {/* Body type-specific */}
        {node.type === 'source' && node.id === 'src_about' && (
          <>
            <div className="pdr-section">
              <h4>{lang === 'fr' ? 'Mon approche' : 'My approach'}</h4>
              {renderRichText(body)}
            </div>
            <div className="pdr-section pdr-section-portrait">
              <image-slot
                id="profile"
                shape="rounded"
                radius="6"
                class="pdr-avatar"
                fit="cover"
                placeholder="Glissez votre photo ici"
                src="assets/profile.jpg"
              />
            </div>
          </>
        )}

        {node.type === 'source' && node.items && (
          <div className="pdr-section">
            <h4>{lang === 'fr' ? 'Détails' : 'Details'}</h4>
            <ul className="pdr-list">
              {node.items.map((it, i) => (
                <li key={i}>
                  <div className="pdr-li-head">
                    <span className="pdr-li-name">{it.name}</span>
                    <span className="pdr-li-year">{it.year}</span>
                  </div>
                  {(it.desc_fr || it.desc_en) && (
                    <div className="pdr-li-desc">{lang === 'fr' ? it.desc_fr : it.desc_en}</div>
                  )}
                  {it.status && <span className={'pdr-li-status ' + it.status}>{it.status}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {node.type === 'tool' && (
          <div className="pdr-section">
            <h4>{lang === 'fr' ? 'Niveau de maîtrise' : 'Proficiency'}</h4>
            <div className="pdr-level-bar">
              <div className="pdr-level-fill" style={{ width: node.level + '%' }}/>
              <span className="pdr-level-num">{node.level}/100</span>
            </div>
          </div>
        )}

        {node.type === 'project' && (
          <>
            <div className="pdr-section">
              <h4>{lang === 'fr' ? 'En résumé' : 'In short'}</h4>
              {body ? renderRichText(body) : <p>{summary}</p>}
            </div>
            {node.live_url && (
              <a href={node.live_url} target="_blank" rel="noopener" className="pdr-cta-primary" style={{marginBottom:'12px'}}>
                <span>{lang === 'fr' ? '🚀 Voir l\'application en ligne' : '🚀 Open live app'}</span>
                <span className="pdr-arrow">↗</span>
              </a>
            )}
            {node.metrics && (
              <div className="pdr-metrics">
                {node.metrics.map(m => (
                  <div key={m.label} className="pdr-metric">
                    <span className="pdr-metric-value">{m.value}</span>
                    <span className="pdr-metric-label">{m.label}</span>
                  </div>
                ))}
              </div>
            )}
            {node.stack && (
              <div className="pdr-section">
                <h4>{lang === 'fr' ? 'Stack' : 'Stack'}</h4>
                <div className="pdr-chips">
                  {node.stack.map(s => <span key={s} className="pdr-chip">{s}</span>)}
                </div>
              </div>
            )}
            {node.mermaid && (
              <div className="pdr-section">
                <h4>{lang === 'fr' ? 'Architecture' : 'Architecture'}</h4>
                <MermaidDiagram code={node.mermaid} id={node.id}/>
              </div>
            )}
            {node.github_url && (
              <a href={node.github_url} target="_blank" rel="noopener" className="pdr-cta-primary">
                <span>{lang === 'fr' ? 'Voir sur GitHub' : 'View on GitHub'}{(node.github_url_secondary_app || node.github_url_secondary_analysis || node.github_url_act1) ? (lang === 'fr' ? ' — Repo principal' : ' — Main repo') : ''}</span>
                <span className="pdr-arrow">↗</span>
              </a>
            )}
            {node.github_url_secondary_app && (
              <a href={node.github_url_secondary_app} target="_blank" rel="noopener" className="pdr-cta-primary" style={{marginTop:'8px'}}>
                <span>{lang === 'fr' ? 'Sous-projet — Adventure Planner' : 'Sub-project — Adventure Planner'}</span>
                <span className="pdr-arrow">↗</span>
              </a>
            )}
            {node.github_url_secondary_analysis && (
              <a href={node.github_url_secondary_analysis} target="_blank" rel="noopener" className="pdr-cta-primary" style={{marginTop:'8px'}}>
                <span>{lang === 'fr' ? 'Sous-projet — ClimAdvisor' : 'Sub-project — ClimAdvisor'}</span>
                <span className="pdr-arrow">↗</span>
              </a>
            )}
            {node.github_url_act1 && (
              <a href={node.github_url_act1} target="_blank" rel="noopener" className="pdr-cta-primary" style={{marginTop:'8px'}}>
                <span>{lang === 'fr' ? 'Acte 1 — Revenge of the Seat (SQL DW)' : 'Act 1 — Revenge of the Seat (SQL DW)'}</span>
                <span className="pdr-arrow">↗</span>
              </a>
            )}
            {node.github_url_act2 && (
              <a href={node.github_url_act2} target="_blank" rel="noopener" className="pdr-cta-primary" style={{marginTop:'8px'}}>
                <span>{lang === 'fr' ? 'Acte 2 — Return of the Jet High (Analytics)' : 'Act 2 — Return of the Jet High (Analytics)'}</span>
                <span className="pdr-arrow">↗</span>
              </a>
            )}
            {node.github_url_act3 && (
              <a href={node.github_url_act3} target="_blank" rel="noopener" className="pdr-cta-primary" style={{marginTop:'8px'}}>
                <span>{lang === 'fr' ? 'Acte 3 — The Rise of the Single Source (dbt)' : 'Act 3 — The Rise of the Single Source (dbt)'}</span>
                <span className="pdr-arrow">↗</span>
              </a>
            )}
          </>
        )}

        {node.type === 'cert' && (
          <div className="pdr-section">
            <div className={'pdr-cert-status pdr-cert-' + node.status}>
              <span className="pdr-cert-dot"/>
              <span>{node.status === 'certified' ? (lang === 'fr' ? 'Certifié' : 'Certified') : (lang === 'fr' ? 'En cours' : 'In progress')}</span>
            </div>
          </div>
        )}

        {node.type === 'ship_cta' && (
          <div className="pdr-ship-actions">
            {node.url && node.url !== '#cv.pdf' && (
              <a href={node.url} target="_blank" rel="noopener" className="pdr-cta-primary">
                <span>{lang === 'fr' ? 'Ouvrir' : 'Open'}</span>
                <span className="pdr-arrow">↗</span>
              </a>
            )}
            {node.url === '#cv.pdf' && (
              <a href="#" className="pdr-cta-primary">
                <span>↓ {lang === 'fr' ? 'Télécharger CV.pdf' : 'Download CV.pdf'}</span>
              </a>
            )}
            {node.email && (
              <a href={'mailto:' + node.email} className="pdr-cta-primary">
                <span>{node.email}</span>
                <span className="pdr-arrow">↗</span>
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
//  Mermaid wrapper
// ============================================================
function MermaidDiagram({ code, id }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !window.mermaid) return;
    const mid = 'mer-' + id + '-' + Date.now();
    ref.current.innerHTML = '';
    try {
      window.mermaid.render(mid, code).then(({ svg }) => {
        if (ref.current) ref.current.innerHTML = svg;
      });
    } catch (e) {
      ref.current.textContent = '◌ Diagram unavailable';
    }
  }, [code, id]);
  return <div className="pdr-mermaid" ref={ref}/>;
}

// Export
window.PipelinePortfolio = PipelinePortfolio;
