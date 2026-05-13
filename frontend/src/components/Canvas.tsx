import { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { Stage, Layer, Line, Circle, Rect, Text, Image as KonvaImage } from "react-konva";
import useImage from "use-image";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Point, ShapeData } from "@/types/labelFile";

const VERTEX_RADIUS = 5;
const STROKE_WIDTH = 2;
const FONT_SIZE = 14;
const DEFAULT_SIZE = 1200;

export type DrawMode = "draw_rect" | "draw_polygon" | "select";

export interface CanvasHandle {
  getStage: () => Konva.Stage | null;
}

interface CanvasProps {
  shapes: ShapeData[];
  selectedId: string | null;
  mode: DrawMode;
  imageSrc: string | null;
  imageSize: { width: number; height: number } | null;
  onShapesChange: (shapes: ShapeData[]) => void;
  onSelectShape: (id: string | null) => void;
  onModeChange: (mode: DrawMode) => void;
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
  },
  ref,
) {
  // ── rect drawing state ──
  const [drawOrigin, setDrawOrigin] = useState<Point | null>(null);
  const [mousePos, setMousePos] = useState<Point | null>(null);

  // ── polygon drawing state ──
  const [polygonPoints, setPolygonPoints] = useState<Point[]>([]);

  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);

  useImperativeHandle(ref, () => ({
    getStage: () => stageRef.current,
  }));

  const [bgImage] = useImage(imageSrc ?? "", imageSrc ? "anonymous" : undefined);

  const stageW = imageSize?.width ?? DEFAULT_SIZE;
  const stageH = imageSize?.height ?? DEFAULT_SIZE;

  useEffect(() => {
    const container = containerRef.current?.parentElement;
    if (!container) return;
    const ro = new ResizeObserver(([entry]) => {
      const cw = entry.contentRect.width - 16;
      const ch = entry.contentRect.height - 16;
      const sx = stageW > 0 ? cw / stageW : 1;
      const sy = stageH > 0 ? ch / stageH : 1;
      setScale(Math.min(sx, sy, 1));
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [stageW, stageH]);

  // ── rectangle drawing ──

  const commitRect = useCallback(
    (p1: Point, p2: Point) => {
      const x1 = Math.min(p1.x, p2.x);
      const y1 = Math.min(p1.y, p2.y);
      const x2 = Math.max(p1.x, p2.x);
      const y2 = Math.max(p1.y, p2.y);
      const w = x2 - x1;
      const h = y2 - y1;

      if (w < 3 || h < 3) {
        setDrawOrigin(null);
        return;
      }

      const newShape: ShapeData = {
        ...newShapeDefaults(),
        points: [[x1, y1], [x2, y2]],
        shape_type: "rectangle",
      } as ShapeData;
      onShapesChange([...shapes, newShape]);
      setDrawOrigin(null);
      onModeChange("select");
      onSelectShape(newShape.node_id);
    },
    [shapes, onShapesChange, onModeChange, onSelectShape],
  );

  // ── polygon drawing ──

  const commitPolygon = useCallback(
    (pts: Point[]) => {
      if (pts.length < 3) return;
      const newShape: ShapeData = {
        ...newShapeDefaults(),
        points: pts.map((p) => [p.x, p.y] as [number, number]),
        shape_type: "polygon",
      } as ShapeData;
      onShapesChange([...shapes, newShape]);
      setPolygonPoints([]);
      onModeChange("select");
      onSelectShape(newShape.node_id);
    },
    [shapes, onShapesChange, onModeChange, onSelectShape],
  );

  const cancelDrawing = useCallback(() => {
    setDrawOrigin(null);
    setPolygonPoints([]);
  }, []);

  const undoLastPolygonPoint = useCallback(() => {
    setPolygonPoints((prev) => prev.slice(0, -1));
  }, []);

  // ── stage events ──

  const handleStageMouseDown = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (mode === "select") return;
      if (e.target !== e.target.getStage() && e.target.name() !== "bg_rect") return;
      const stage = e.target.getStage();
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;

      if (mode === "draw_rect") {
        setDrawOrigin({ x: pos.x, y: pos.y });
      } else if (mode === "draw_polygon") {
        setPolygonPoints((prev) => [...prev, { x: pos.x, y: pos.y }]);
      }
    },
    [mode],
  );

  const handleStageMouseUp = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (mode !== "draw_rect" || !drawOrigin) return;
      const stage = e.target.getStage();
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (pos) commitRect(drawOrigin, { x: pos.x, y: pos.y });
    },
    [mode, drawOrigin, commitRect],
  );

  const handleMouseMove = useCallback((e: KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;
    setMousePos(stage.getPointerPosition() ?? null);
  }, []);

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
      onShapesChange(
        shapes.map((s) => {
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
    [shapes, onShapesChange],
  );

  // ── keyboard ──

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (mode === "draw_rect" && drawOrigin) {
          cancelDrawing();
        } else if (mode === "draw_polygon" && polygonPoints.length > 0) {
          polygonPoints.length > 1 ? undoLastPolygonPoint() : cancelDrawing();
        } else if (mode === "select" && selectedId) {
          onSelectShape(null);
        }
      }
      if (e.key === "Enter" && mode === "draw_polygon" && polygonPoints.length >= 3) {
        commitPolygon(polygonPoints);
      }
    },
    [mode, drawOrigin, polygonPoints, selectedId, cancelDrawing, undoLastPolygonPoint, commitPolygon, onSelectShape],
  );

  // ── edge rendering data ──

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

  // ── live previews ──

  const previewRect =
    mode === "draw_rect" && drawOrigin && mousePos
      ? {
          x: Math.min(drawOrigin.x, mousePos.x),
          y: Math.min(drawOrigin.y, mousePos.y),
          width: Math.abs(mousePos.x - drawOrigin.x),
          height: Math.abs(mousePos.y - drawOrigin.y),
        }
      : null;

  const showPolyPreview = mode === "draw_polygon" && polygonPoints.length > 0;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="konva-container m-4 focus:outline-none"
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

        {/* edge lines (relation links) */}
        <Layer>
          {edgeLines.map((el, i) => (
            <EdgeRenderer
              key={`edge-${i}`}
              from={el.from}
              to={el.to}
              relation={el.relation}
              scale={scale}
            />
          ))}
        </Layer>

        {/* shapes */}
        <Layer>
          {shapes.map((shape) => (
            <ShapeRenderer
              key={shape.node_id}
              shape={shape}
              scale={scale}
              isSelected={shape.node_id === selectedId && mode === "select"}
              onSelect={() => {
                if (mode === "select") onSelectShape(shape.node_id);
              }}
              onVertexDragMove={handleVertexDragMove}
            />
          ))}
        </Layer>

        {/* rectangle drawing preview */}
        <Layer>
          {previewRect && (
            <Rect
              x={previewRect.x}
              y={previewRect.y}
              width={previewRect.width}
              height={previewRect.height}
              stroke="#2196f3"
              strokeWidth={STROKE_WIDTH / scale}
              dash={[4 / scale, 3 / scale]}
              fill="rgba(33,150,243,0.06)"
            />
          )}
        </Layer>

        {/* polygon drawing preview */}
        <Layer>
          {showPolyPreview && (
            <>
              {/* committed segments */}
              <Line
                points={polygonPoints.flatMap((p) => [p.x, p.y])}
                stroke="#2196f3"
                strokeWidth={STROKE_WIDTH / scale}
                lineCap="round"
                lineJoin="round"
                fill="rgba(33,150,243,0.06)"
              />
              {/* guide line from last vertex to cursor */}
              {mousePos && (
                <Line
                  points={[
                    polygonPoints[polygonPoints.length - 1].x,
                    polygonPoints[polygonPoints.length - 1].y,
                    mousePos.x,
                    mousePos.y,
                  ]}
                  stroke="#2196f3"
                  strokeWidth={STROKE_WIDTH / scale}
                  dash={[4 / scale, 3 / scale]}
                />
              )}
              {/* vertex dots */}
              {polygonPoints.map((p, i) => (
                <Circle
                  key={i}
                  x={p.x}
                  y={p.y}
                  radius={4 / scale}
                  fill={i === 0 ? "#4caf50" : "#2196f3"}
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

// ── sub-renderers ──

function EdgeRenderer({
  from, to, relation, scale,
}: {
  from: Point; to: Point; relation: string; scale: number;
}) {
  const sw = STROKE_WIDTH / scale;
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;

  return (
    <>
      <Line
        points={[from.x, from.y, to.x, to.y]}
        stroke="rgba(0,100,255,0.6)"
        strokeWidth={sw}
        dash={[6 / scale, 4 / scale]}
        lineCap="round"
      />
      <Text
        x={mx} y={my}
        text={relation}
        fontSize={FONT_SIZE / scale}
        fill="#cc0000"
        fontStyle="bold"
      />
    </>
  );
}

function ShapeRenderer({
  shape, scale, isSelected, onSelect, onVertexDragMove,
}: {
  shape: ShapeData;
  scale: number;
  isSelected: boolean;
  onSelect: () => void;
  onVertexDragMove: (nodeId: string, vi: number, e: KonvaEventObject<MouseEvent>) => void;
}) {
  const sw = STROKE_WIDTH / scale;
  const fs = FONT_SIZE / scale;
  const isRect = shape.shape_type === "rectangle" && shape.points.length === 2;
  const firstP = shape.points[0];

  const rectProps =
    isRect
      ? {
          x: firstP[0],
          y: firstP[1],
          width: shape.points[1][0] - firstP[0],
          height: shape.points[1][1] - firstP[1],
        }
      : null;

  return (
    <>
      {rectProps ? (
        <Rect
          {...rectProps}
          fill={isSelected ? "rgba(0,255,0,0.08)" : "rgba(0,0,0,0.04)"}
          stroke={isSelected ? "#00ff00" : "rgba(0,255,0,0.5)"}
          strokeWidth={sw}
          onClick={onSelect}
        />
      ) : (
        <Line
          points={shape.points.flatMap((p) => [p[0], p[1]])}
          closed
          fill={isSelected ? "rgba(0,255,0,0.08)" : "rgba(0,0,0,0.04)"}
          stroke={isSelected ? "#00ff00" : "rgba(0,255,0,0.5)"}
          strokeWidth={sw}
          lineCap="round"
          lineJoin="round"
          onClick={onSelect}
        />
      )}

      <LabelTag
        text={labelText(shape)}
        anchorX={firstP[0]}
        anchorY={firstP[1] - 4 / scale}
        fontSize={fs}
      />

      {isSelected &&
        shape.points.map((p, i) => (
          <Circle
            key={i}
            x={p[0]}
            y={p[1]}
            radius={VERTEX_RADIUS / scale}
            fill="#fff"
            stroke="#00ff00"
            strokeWidth={sw}
            draggable
            onDragMove={(e) => onVertexDragMove(shape.node_id, i, e)}
          />
        ))}
    </>
  );
}

function LabelTag({
  text, anchorX, anchorY, fontSize,
}: {
  text: string; anchorX: number; anchorY: number; fontSize: number;
}) {
  if (!text) return null;
  const estW = text.length * fontSize * 0.6 + 8;
  const estH = fontSize * 1.4;

  return (
    <>
      <Rect
        x={anchorX} y={anchorY - estH}
        width={estW} height={estH}
        fill="rgba(255,255,255,0.75)"
        stroke="rgba(0,0,0,0.15)"
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
