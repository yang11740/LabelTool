import { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { Stage, Layer, Line, Circle, Rect, Text, Image as KonvaImage } from "react-konva";
import useImage from "use-image";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Dispatch, SetStateAction } from "react";
import type { Point, ShapeData } from "@/types/labelFile";

const VERTEX_RADIUS = 5;
const STROKE_WIDTH = 2;
const FONT_SIZE = 14;
const DEFAULT_SIZE = 1200;

export type DrawMode =
  | "draw_rect"
  | "draw_polygon"
  | "draw_circle"
  | "draw_point"
  | "draw_line"
  | "draw_polyline"
  | "select";

export interface CanvasHandle {
  getStage: () => Konva.Stage | null;
  getScale: () => number;
  setScale: (s: number) => void;
  fitToContainer: () => void;
}

interface CanvasProps {
  shapes: ShapeData[];
  selectedId: string | null;
  mode: DrawMode;
  imageSrc: string | null;
  imageSize: { width: number; height: number } | null;
  onShapesChange: Dispatch<SetStateAction<ShapeData[]>>;
  onSelectShape: (id: string | null) => void;
  onModeChange: (mode: DrawMode) => void;
  onSave: () => void;
  onMouseCoords?: (coords: { x: number; y: number } | null) => void;
  onShapeCreated?: (shape: ShapeData) => void;
}

// ── Multi-color palette for shapes ──
const SHAPE_COLORS = [
  "#6366f1", // indigo
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
  "#ec4899", // pink
];

function shapeColor(index: number): string {
  return SHAPE_COLORS[index % SHAPE_COLORS.length];
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function newShapeDefaults(): Partial<ShapeData> {
  return {
    label: "",
    flags: {},
    description: "",
    group_id: null,
    mask: null,
    node_id: `n_${Date.now()}`,
    type: "",
    transcription: "",
    attributes: { z_index: 0, color: "black" },
    edges: [],
    other_data: {},
  };
}

const Canvas = forwardRef<CanvasHandle, CanvasProps>(function Canvas(
  {
    shapes,
    selectedId,
    mode,
    imageSrc,
    imageSize,
    onShapesChange,
    onSelectShape,
    onModeChange,
    onSave,
    onMouseCoords,
    onShapeCreated,
  },
  ref,
) {
  // ── rect drawing state ──
  const [drawOrigin, setDrawOrigin] = useState<Point | null>(null);
  const [mousePos, setMousePos] = useState<Point | null>(null);

  // ── polygon / polyline drawing state ──
  const [polyPoints, setPolyPoints] = useState<Point[]>([]);

  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const containerParentRef = useRef<HTMLElement | null>(null);

  const [bgImage] = useImage(imageSrc ?? "", imageSrc ? "anonymous" : undefined);

  const stageW = imageSize?.width ?? DEFAULT_SIZE;
  const stageH = imageSize?.height ?? DEFAULT_SIZE;

  const fitToContainer = useCallback(() => {
    const container = containerParentRef.current;
    if (!container) return;
    const cw = container.clientWidth - 16;
    const ch = container.clientHeight - 16;
    const sx = stageW > 0 ? cw / stageW : 1;
    const sy = stageH > 0 ? ch / stageH : 1;
    setScale(Math.min(sx, sy, 1));
  }, [stageW, stageH]);

  useEffect(() => {
    const container = containerRef.current?.parentElement ?? null;
    containerParentRef.current = container;
    if (!container) return;
    const ro = new ResizeObserver(() => fitToContainer());
    ro.observe(container);
    return () => ro.disconnect();
  }, [fitToContainer]);

  useImperativeHandle(ref, () => ({
    getStage: () => stageRef.current,
    getScale: () => scale,
    setScale: (s: number) => setScale(Math.max(0.1, Math.min(s, 5))),
    fitToContainer,
  }), [scale, fitToContainer]);

  // ── drawing commit helpers ──

  const commitRect = useCallback(
    (p1: Point, p2: Point) => {
      const x1 = Math.min(p1.x, p2.x);
      const y1 = Math.min(p1.y, p2.y);
      const x2 = Math.max(p1.x, p2.x);
      const y2 = Math.max(p1.y, p2.y);
      const w = x2 - x1;
      const h = y2 - y1;
      if (w < 3 || h < 3) { setDrawOrigin(null); return; }
      const s: ShapeData = {
        ...newShapeDefaults(),
        points: [[x1, y1], [x2, y2]],
        shape_type: "rectangle",
      } as ShapeData;
      onShapesChange((prev) => [...prev, s]);
      setDrawOrigin(null);
      onModeChange("select");
      onSelectShape(s.node_id);
      onShapeCreated?.(s);
    },
    [onShapesChange, onModeChange, onSelectShape, onShapeCreated],
  );

  const commitPolygon = useCallback(
    (pts: Point[]) => {
      if (pts.length < 3) return;
      const s: ShapeData = {
        ...newShapeDefaults(),
        points: pts.map((p) => [p.x, p.y] as [number, number]),
        shape_type: "polygon",
      } as ShapeData;
      onShapesChange((prev) => [...prev, s]);
      setPolyPoints([]);
      onModeChange("select");
      onSelectShape(s.node_id);
      onShapeCreated?.(s);
    },
    [onShapesChange, onModeChange, onSelectShape, onShapeCreated],
  );

  const commitCircle = useCallback(
    (center: Point, edge: Point) => {
      const radius = Math.hypot(edge.x - center.x, edge.y - center.y);
      if (radius < 3) { setDrawOrigin(null); return; }
      const s: ShapeData = {
        ...newShapeDefaults(),
        points: [[center.x, center.y], [edge.x, edge.y]],
        shape_type: "circle",
      } as ShapeData;
      onShapesChange((prev) => [...prev, s]);
      setDrawOrigin(null);
      onModeChange("select");
      onSelectShape(s.node_id);
      onShapeCreated?.(s);
    },
    [onShapesChange, onModeChange, onSelectShape, onShapeCreated],
  );

  const commitPoint = useCallback(
    (pt: Point) => {
      const s: ShapeData = {
        ...newShapeDefaults(),
        points: [[pt.x, pt.y]],
        shape_type: "point",
      } as ShapeData;
      onShapesChange((prev) => [...prev, s]);
      onModeChange("select");
      onSelectShape(s.node_id);
      onShapeCreated?.(s);
    },
    [onShapesChange, onModeChange, onSelectShape, onShapeCreated],
  );

  const commitLine = useCallback(
    (p1: Point, p2: Point) => {
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (dist < 3) { setDrawOrigin(null); return; }
      const s: ShapeData = {
        ...newShapeDefaults(),
        points: [[p1.x, p1.y], [p2.x, p2.y]],
        shape_type: "line",
      } as ShapeData;
      onShapesChange((prev) => [...prev, s]);
      setDrawOrigin(null);
      onModeChange("select");
      onSelectShape(s.node_id);
      onShapeCreated?.(s);
    },
    [onShapesChange, onModeChange, onSelectShape, onShapeCreated],
  );

  const commitPolyline = useCallback(
    (pts: Point[]) => {
      if (pts.length < 2) return;
      const s: ShapeData = {
        ...newShapeDefaults(),
        points: pts.map((p) => [p.x, p.y] as [number, number]),
        shape_type: "linestrip",
      } as ShapeData;
      onShapesChange((prev) => [...prev, s]);
      setPolyPoints([]);
      onModeChange("select");
      onSelectShape(s.node_id);
      onShapeCreated?.(s);
    },
    [onShapesChange, onModeChange, onSelectShape, onShapeCreated],
  );

  const cancelDrawing = useCallback(() => {
    setDrawOrigin(null);
    setPolyPoints([]);
  }, []);

  const undoLastPolyPoint = useCallback(() => {
    setPolyPoints((prev) => prev.slice(0, -1));
  }, []);

  // ── stage mouse events ──

  const handleStageMouseDown = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (mode === "select") return;
      if (e.target !== e.target.getStage() && e.target.name() !== "bg_rect") return;
      const stage = e.target.getStage();
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;

      switch (mode) {
        case "draw_rect":
          setDrawOrigin({ x: pos.x, y: pos.y });
          break;
        case "draw_circle":
          setDrawOrigin({ x: pos.x, y: pos.y });
          break;
        case "draw_line":
          setDrawOrigin({ x: pos.x, y: pos.y });
          break;
        case "draw_point":
          commitPoint({ x: pos.x, y: pos.y });
          break;
        case "draw_polygon":
        case "draw_polyline":
          setPolyPoints((prev) => [...prev, { x: pos.x, y: pos.y }]);
          break;
      }
    },
    [mode, commitPoint],
  );

  const handleStageMouseUp = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;

      switch (mode) {
        case "draw_rect":
          if (drawOrigin) commitRect(drawOrigin, { x: pos.x, y: pos.y });
          break;
        case "draw_circle":
          if (drawOrigin) commitCircle(drawOrigin, { x: pos.x, y: pos.y });
          break;
        case "draw_line":
          if (drawOrigin) commitLine(drawOrigin, { x: pos.x, y: pos.y });
          break;
      }
    },
    [mode, drawOrigin, commitRect, commitCircle, commitLine],
  );

  const handleMouseMove = useCallback((e: KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getPointerPosition() ?? null;
    setMousePos(pos);
    onMouseCoords?.(pos);
  }, [onMouseCoords]);

  const handleDeselect = useCallback(() => {
    if (mode === "select") onSelectShape(null);
  }, [mode, onSelectShape]);

  // ── vertex drag ──

  const handleVertexDragMove = useCallback(
    (nodeId: string, vertexIndex: number, e: KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      onShapesChange((prev) =>
        prev.map((s) => {
          if (s.node_id !== nodeId) return s;
          const pts = [...s.points];
          pts[vertexIndex] = [pos.x, pos.y];
          if (s.shape_type === "rectangle" && pts.length === 2) {
            const [p0, p1] = pts;
            pts[0] = [Math.min(p0[0], p1[0]), Math.min(p0[1], p1[1])];
            pts[1] = [Math.max(p0[0], p1[0]), Math.max(p0[1], p1[1])];
          }
          return { ...s, points: pts };
        }),
      );
    },
    [onShapesChange],
  );

  // ── keyboard ──

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (mode === "draw_rect" && drawOrigin) cancelDrawing();
        else if (mode === "draw_circle" && drawOrigin) cancelDrawing();
        else if (mode === "draw_line" && drawOrigin) cancelDrawing();
        else if ((mode === "draw_polygon" || mode === "draw_polyline") && polyPoints.length > 0) {
          polyPoints.length > 1 ? undoLastPolyPoint() : cancelDrawing();
        } else if (mode === "select" && selectedId) onSelectShape(null);
      }
      if (e.key === "Enter" && mode === "draw_polygon" && polyPoints.length >= 3) {
        commitPolygon(polyPoints);
      }
      if (e.key === "Enter" && mode === "draw_polyline" && polyPoints.length >= 2) {
        commitPolyline(polyPoints);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && mode === "select" && selectedId) {
        onShapesChange((prev) => prev.filter((s) => s.node_id !== selectedId));
        onSelectShape(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        onSave();
      }
    },
    [mode, drawOrigin, polyPoints, selectedId, cancelDrawing, undoLastPolyPoint, commitPolygon, commitPolyline, onSelectShape, onShapesChange, onSave],
  );

  // ── edge lines ──

  const nodeIndex = new Map<string, ShapeData>();
  for (const s of shapes) nodeIndex.set(s.node_id, s);

  const edgeLines: { from: Point; to: Point; relation: string }[] = [];
  for (const s of shapes) {
    if (!s.edges.length) continue;
    const fc = centroid(s.points);
    for (const edge of s.edges) {
      const target = nodeIndex.get(edge.target);
      if (!target) continue;
      edgeLines.push({ from: fc, to: centroid(target.points), relation: edge.relation });
    }
  }

  // ── previews ──

  const previewRect =
    mode === "draw_rect" && drawOrigin && mousePos
      ? {
          x: Math.min(drawOrigin.x, mousePos.x),
          y: Math.min(drawOrigin.y, mousePos.y),
          width: Math.abs(mousePos.x - drawOrigin.x),
          height: Math.abs(mousePos.y - drawOrigin.y),
        }
      : null;

  const previewCircle =
    mode === "draw_circle" && drawOrigin && mousePos
      ? { x: drawOrigin.x, y: drawOrigin.y, radius: Math.hypot(mousePos.x - drawOrigin.x, mousePos.y - drawOrigin.y) }
      : null;

  const previewLine =
    mode === "draw_line" && drawOrigin && mousePos
      ? [drawOrigin.x, drawOrigin.y, mousePos.x, mousePos.y]
      : null;

  const showPolyPreview = (mode === "draw_polygon" || mode === "draw_polyline") && polyPoints.length > 0;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="konva-container focus:outline-none"
    >
      <Stage
        ref={stageRef}
        width={stageW * scale}
        height={stageH * scale}
        scaleX={scale}
        scaleY={scale}
        onMouseDown={handleStageMouseDown}
        onMouseUp={handleStageMouseUp}
        onMouseMove={handleMouseMove}
      >
        {/* background layer */}
        <Layer>
          {bgImage ? (
            <KonvaImage
              image={bgImage}
              x={0} y={0}
              width={stageW} height={stageH}
              name="bg_rect"
              onClick={mode === "select" ? handleDeselect : undefined}
            />
          ) : (
            <Rect
              name="bg_rect" x={0} y={0} width={stageW} height={stageH}
              fill="#f8f8f8"
              onClick={mode === "select" ? handleDeselect : undefined}
            />
          )}
        </Layer>

        {/* edge lines */}
        <Layer>
          {edgeLines.map((el, i) => (
            <EdgeRenderer key={`edge-${i}`} from={el.from} to={el.to} relation={el.relation} scale={scale} />
          ))}
        </Layer>

        {/* shapes */}
        <Layer>
          {shapes.map((shape, i) => (
            <ShapeRenderer
              key={shape.node_id}
              shape={shape}
              scale={scale}
              color={shapeColor(i)}
              isSelected={shape.node_id === selectedId && mode === "select"}
              onSelect={() => { if (mode === "select") onSelectShape(shape.node_id); }}
              onVertexDragMove={handleVertexDragMove}
            />
          ))}
        </Layer>

        {/* rectangle preview */}
        <Layer>
          {previewRect && (
            <Rect
              x={previewRect.x} y={previewRect.y}
              width={previewRect.width} height={previewRect.height}
              stroke="#6366f1"
              strokeWidth={STROKE_WIDTH / scale}
              dash={[4 / scale, 3 / scale]}
              fill="rgba(99,102,241,0.06)"
            />
          )}
        </Layer>

        {/* circle preview */}
        <Layer>
          {previewCircle && (
            <Circle
              x={previewCircle.x} y={previewCircle.y}
              radius={previewCircle.radius}
              stroke="#6366f1"
              strokeWidth={STROKE_WIDTH / scale}
              dash={[4 / scale, 3 / scale]}
              fill="rgba(99,102,241,0.06)"
            />
          )}
        </Layer>

        {/* line preview */}
        <Layer>
          {previewLine && (
            <Line
              points={previewLine}
              stroke="#6366f1"
              strokeWidth={STROKE_WIDTH / scale}
              dash={[4 / scale, 3 / scale]}
              lineCap="round"
            />
          )}
        </Layer>

        {/* polygon / polyline preview */}
        <Layer>
          {showPolyPreview && (
            <>
              <Line
                points={polyPoints.flatMap((p) => [p.x, p.y])}
                stroke="#6366f1"
                strokeWidth={STROKE_WIDTH / scale}
                lineCap="round"
                lineJoin="round"
                closed={mode === "draw_polygon"}
                fill={mode === "draw_polygon" ? "rgba(99,102,241,0.06)" : undefined}
              />
              {mousePos && (
                <Line
                  points={[
                    polyPoints[polyPoints.length - 1].x,
                    polyPoints[polyPoints.length - 1].y,
                    mousePos.x,
                    mousePos.y,
                  ]}
                  stroke="#6366f1"
                  strokeWidth={STROKE_WIDTH / scale}
                  dash={[4 / scale, 3 / scale]}
                />
              )}
              {polyPoints.map((p, i) => (
                <Circle
                  key={i}
                  x={p.x} y={p.y}
                  radius={4 / scale}
                  fill={i === 0 ? "#10b981" : "#6366f1"}
                  stroke="#fff"
                  strokeWidth={1 / scale}
                />
              ))}
            </>
          )}
        </Layer>
      </Stage>
    </div>
  );
});

export default Canvas;

// ── helpers ──

function centroid(points: [number, number][]): Point {
  const n = points.length;
  const cx = points.reduce((s, p) => s + p[0], 0) / n;
  const cy = points.reduce((s, p) => s + p[1], 0) / n;
  return { x: cx, y: cy };
}

function labelText(shape: ShapeData): string {
  const tag = shape.node_id || "";
  const body = shape.type || shape.label || "";
  if (body && body === tag) return `[${tag}]`;
  return tag ? `[${tag}] ${body}` : body;
}

// ── Edge renderer ──

function EdgeRenderer({
  from, to, relation, scale,
}: { from: Point; to: Point; relation: string; scale: number }) {
  const sw = STROKE_WIDTH / scale;
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  return (
    <>
      <Line
        points={[from.x, from.y, to.x, to.y]}
        stroke="rgba(99,102,241,0.5)"
        strokeWidth={sw}
        dash={[6 / scale, 4 / scale]}
        lineCap="round"
      />
      <Text
        x={mx} y={my}
        text={relation}
        fontSize={FONT_SIZE / scale}
        fill="#ef4444"
        fontStyle="bold"
      />
    </>
  );
}

// ── Shape renderer ──

function ShapeRenderer({
  shape, scale, color, isSelected, onSelect, onVertexDragMove,
}: {
  shape: ShapeData;
  scale: number;
  color: string;
  isSelected: boolean;
  onSelect: () => void;
  onVertexDragMove: (nodeId: string, vi: number, e: KonvaEventObject<MouseEvent>) => void;
}) {
  const sw = STROKE_WIDTH / scale;
  const fs = FONT_SIZE / scale;
  const firstP = shape.points[0];

  // Selected: use the shape's assigned color with higher opacity
  // Normal: use assigned color with normal settings
  const strokeColor = isSelected ? "#1e1e1e" : color;
  const fillAlpha = isSelected ? 0.12 : 0.06;
  const fillColor = hexToRgba(color, fillAlpha);
  const selStrokeWidth = isSelected ? sw * 1.5 : sw;

  const commonProps = {
    onClick: onSelect,
    stroke: strokeColor,
    strokeWidth: selStrokeWidth,
  };

  switch (shape.shape_type) {
    case "rectangle": {
      const [p0, p1] = shape.points;
      const x = Math.min(p0[0], p1[0]);
      const y = Math.min(p0[1], p1[1]);
      const w = Math.abs(p1[0] - p0[0]);
      const h = Math.abs(p1[1] - p0[1]);
      return (
        <>
          <Rect {...commonProps} x={x} y={y} width={w} height={h} fill={fillColor} />
          <LabelTag text={labelText(shape)} anchorX={p0[0]} anchorY={p0[1] - 4 / scale} fontSize={fs} />
          {isSelected && shape.points.map((p, i) => (
            <Circle
              key={i} x={p[0]} y={p[1]}
              radius={VERTEX_RADIUS / scale}
              fill="#fff" stroke="#1e1e1e" strokeWidth={sw}
              draggable
              onDragMove={(e) => onVertexDragMove(shape.node_id, i, e)}
            />
          ))}
        </>
      );
    }

    case "circle": {
      const [c, edge] = shape.points;
      const r = Math.hypot((edge?.[0] ?? 0) - c[0], (edge?.[1] ?? 0) - c[1]);
      return (
        <>
          <Circle {...commonProps} x={c[0]} y={c[1]} radius={r} fill={fillColor} />
          <LabelTag text={labelText(shape)} anchorX={c[0] - r} anchorY={c[1] - r - 4 / scale} fontSize={fs} />
          {isSelected && (
            <>
              <Circle
                x={c[0]} y={c[1]} radius={4 / scale}
                fill="#fff" stroke="#1e1e1e" strokeWidth={sw}
              />
              <Circle
                x={edge?.[0] ?? 0} y={edge?.[1] ?? 0}
                radius={VERTEX_RADIUS / scale}
                fill="#fff" stroke="#1e1e1e" strokeWidth={sw}
                draggable
                onDragMove={(e) => onVertexDragMove(shape.node_id, 1, e)}
              />
            </>
          )}
        </>
      );
    }

    case "point": {
      const ptR = 4 / scale;
      return (
        <>
          <Circle
            {...commonProps}
            x={firstP[0]} y={firstP[1]}
            radius={ptR}
            fill={isSelected ? "#1e1e1e" : color}
          />
          <LabelTag text={labelText(shape)} anchorX={firstP[0] + 6 / scale} anchorY={firstP[1] - 2 / scale} fontSize={fs} />
          {isSelected && (
            <Circle
              x={firstP[0]} y={firstP[1]}
              radius={VERTEX_RADIUS / scale}
              fill="#fff" stroke="#1e1e1e" strokeWidth={sw}
              draggable
              onDragMove={(e) => onVertexDragMove(shape.node_id, 0, e)}
            />
          )}
        </>
      );
    }

    case "line":
    case "linestrip": {
      const isClosed = false; // lines and polylines are open
      return (
        <>
          <Line
            {...commonProps}
            points={shape.points.flatMap((p) => [p[0], p[1]])}
            closed={isClosed}
            fill={undefined}
            lineCap="round"
            lineJoin="round"
          />
          <LabelTag text={labelText(shape)} anchorX={firstP[0]} anchorY={firstP[1] - 4 / scale} fontSize={fs} />
          {isSelected && shape.points.map((p, i) => (
            <Circle
              key={i} x={p[0]} y={p[1]}
              radius={VERTEX_RADIUS / scale}
              fill="#fff" stroke="#1e1e1e" strokeWidth={sw}
              draggable
              onDragMove={(e) => onVertexDragMove(shape.node_id, i, e)}
            />
          ))}
        </>
      );
    }

    case "polygon":
    default: {
      return (
        <>
          <Line
            {...commonProps}
            points={shape.points.flatMap((p) => [p[0], p[1]])}
            closed
            fill={fillColor}
            lineCap="round"
            lineJoin="round"
          />
          <LabelTag text={labelText(shape)} anchorX={firstP[0]} anchorY={firstP[1] - 4 / scale} fontSize={fs} />
          {isSelected && shape.points.map((p, i) => (
            <Circle
              key={i} x={p[0]} y={p[1]}
              radius={VERTEX_RADIUS / scale}
              fill="#fff" stroke="#1e1e1e" strokeWidth={sw}
              draggable
              onDragMove={(e) => onVertexDragMove(shape.node_id, i, e)}
            />
          ))}
        </>
      );
    }
  }
}

// ── Label tag ──

function LabelTag({
  text, anchorX, anchorY, fontSize,
}: { text: string; anchorX: number; anchorY: number; fontSize: number }) {
  if (!text) return null;
  const estW = text.length * fontSize * 0.6 + 8;
  const estH = fontSize * 1.4;
  return (
    <>
      <Rect
        x={anchorX} y={anchorY - estH}
        width={estW} height={estH}
        fill="rgba(255,255,255,0.85)"
        stroke="rgba(0,0,0,0.12)"
        strokeWidth={0.5}
        cornerRadius={2}
      />
      <Text
        x={anchorX + 4} y={anchorY - estH + 2}
        text={text}
        fontSize={fontSize}
        fill="#333333"
        fontStyle="bold"
      />
    </>
  );
}
