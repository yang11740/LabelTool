import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Stage, Layer, Line, Circle, Rect, Text, Image as KonvaImage } from "react-konva";
import useImage from "use-image";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Point, ShapeData, ShapeType } from "@/types/labelFile";
import {
  cloneShapes,
  createShapeData,
  distance,
  isMeaningfulShape,
  nextNodeId,
  rectanglePoints,
  translateShape,
} from "@/utils/shapeFactory";

const VERTEX_RADIUS = 5;
const STROKE_WIDTH = 2;
const FONT_SIZE = 14;
const DEFAULT_SIZE = 1200;

export type DrawMode =
  | "select"
  | "draw_rect"
  | "draw_polygon"
  | "draw_point"
  | "draw_line"
  | "draw_circle"
  | "draw_linestrip";

export interface CanvasHandle {
  getStage: () => Konva.Stage | null;
  fitToScreen: () => void;
  resetZoom: () => void;
  deleteSelectedVertex: () => boolean;
}

interface CanvasProps {
  shapes: ShapeData[];
  selectedId: string | null;
  mode: DrawMode;
  imageSrc: string | null;
  imageSize: { width: number; height: number } | null;
  onShapesChange: (shapes: ShapeData[], historyBase?: ShapeData[]) => void;
  onShapesPreview: (shapes: ShapeData[]) => void;
  onSelectShape: (id: string | null) => void;
  onModeChange: (mode: DrawMode) => void;
  readOnly?: boolean;
}

const Canvas = forwardRef<CanvasHandle, CanvasProps>(function Canvas(
  {
    shapes,
    selectedId,
    mode,
    imageSrc,
    imageSize,
    onShapesChange,
    onShapesPreview,
    onSelectShape,
    onModeChange,
    readOnly = false,
  },
  ref,
) {
  const [dragOrigin, setDragOrigin] = useState<Point | null>(null);
  const [mousePos, setMousePos] = useState<Point | null>(null);
  const [freehandPoints, setFreehandPoints] = useState<Point[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [selectedVertex, setSelectedVertex] = useState<{ nodeId: string; index: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const dragBaseRef = useRef<ShapeData[] | null>(null);
  const shapeDragRef = useRef<{ nodeId: string; start: Point; base: ShapeData[] } | null>(null);
  const spacePressedRef = useRef(false);
  const panRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  const [bgImage] = useImage(imageSrc ?? "", imageSrc ? "anonymous" : undefined);
  const stageW = imageSize?.width ?? DEFAULT_SIZE;
  const stageH = imageSize?.height ?? DEFAULT_SIZE;
  const scale = fitScale * zoom;

  const fitToScreen = useCallback(() => {
    setZoom(1);
    requestAnimationFrame(() => {
      const scrollEl = scrollRef.current;
      if (!scrollEl) return;
      scrollEl.scrollLeft = 0;
      scrollEl.scrollTop = 0;
    });
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(fitScale > 0 ? 1 / fitScale : 1);
  }, [fitScale]);

  const deleteSelectedVertex = useCallback(() => {
    if (readOnly) return false;
    if (!selectedVertex) return false;
    const target = shapes.find((shape) => shape.node_id === selectedVertex.nodeId);
    if (!target || target.points.length <= minPointsForShape(target.shape_type)) return false;
    const next = shapes.map((shape) => {
      if (shape.node_id !== selectedVertex.nodeId) return shape;
      return {
        ...shape,
        points: shape.points.filter((_, index) => index !== selectedVertex.index),
      };
    });
    onShapesChange(next);
    setSelectedVertex(null);
    return true;
  }, [onShapesChange, readOnly, selectedVertex, shapes]);

  useImperativeHandle(ref, () => ({
    getStage: () => stageRef.current,
    fitToScreen,
    resetZoom,
    deleteSelectedVertex,
  }));

  useEffect(() => {
    setDragOrigin(null);
    setMousePos(null);
    setFreehandPoints([]);
    setHoveredId(null);
    setSelectedVertex(null);
  }, [imageSrc, mode]);

  useEffect(() => {
    const container = containerRef.current?.parentElement;
    if (!container) return;
    const ro = new ResizeObserver(([entry]) => {
      const cw = entry.contentRect.width - 16;
      const ch = entry.contentRect.height - 16;
      const sx = stageW > 0 ? cw / stageW : 1;
      const sy = stageH > 0 ? ch / stageH : 1;
      setFitScale(Math.min(sx, sy, 1));
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [stageW, stageH]);

  const addShape = useCallback(
    (shapeType: ShapeType, points: [number, number][]) => {
      if (readOnly) return;
      if (!isMeaningfulShape(shapeType, points)) return;
      const newShape = createShapeData(shapeType, points, { node_id: nextNodeId(shapes) });
      onShapesChange([...shapes, newShape]);
      onSelectShape(newShape.node_id);
      onModeChange("select");
    },
    [onModeChange, onSelectShape, onShapesChange, readOnly, shapes],
  );

  const stagePoint = (e: KonvaEventObject<MouseEvent>): Point | null => {
    const stage = e.target.getStage();
    const pos = stage?.getPointerPosition();
    if (!stage || !pos) return null;
    return stage.getAbsoluteTransform().copy().invert().point(pos);
  };

  const handleStageMouseDown = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (readOnly || mode === "select") return;
      if (e.target !== e.target.getStage() && e.target.name() !== "bg_rect") return;
      const pos = stagePoint(e);
      if (!pos) return;

      if (mode === "draw_point") {
        addShape("point", [[pos.x, pos.y]]);
      } else if (mode === "draw_polygon" || mode === "draw_linestrip") {
        if (mode === "draw_polygon" && shouldClosePolygon(freehandPoints, pos, scale)) {
          addShape("polygon", freehandPoints.map((p) => [p.x, p.y]));
          setFreehandPoints([]);
          return;
        }
        setFreehandPoints((prev) => [...prev, pos]);
      } else {
        setDragOrigin(pos);
      }
    },
    [addShape, freehandPoints, mode, readOnly, scale],
  );

  const handleStageMouseUp = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (readOnly || !dragOrigin) return;
      const pos = stagePoint(e);
      if (!pos) return;

      if (mode === "draw_rect") {
        addShape("rectangle", rectanglePoints(dragOrigin, pos));
      } else if (mode === "draw_line") {
        addShape("line", [
          [dragOrigin.x, dragOrigin.y],
          [pos.x, pos.y],
        ]);
      } else if (mode === "draw_circle") {
        addShape("circle", [
          [dragOrigin.x, dragOrigin.y],
          [pos.x, pos.y],
        ]);
      }
      setDragOrigin(null);
    },
    [addShape, dragOrigin, mode, readOnly],
  );

  const handleMouseMove = useCallback((e: KonvaEventObject<MouseEvent>) => {
    setMousePos(stagePoint(e));
  }, []);

  const handleWheel = useCallback((e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    setZoom((current) => {
      const factor = e.evt.deltaY > 0 ? 0.9 : 1.1;
      return Math.min(8, Math.max(0.15, current * factor));
    });
  }, []);

  const commitFreehandShape = useCallback(() => {
    if (mode === "draw_polygon") {
      addShape("polygon", freehandPoints.map((p) => [p.x, p.y]));
      setFreehandPoints([]);
    } else if (mode === "draw_linestrip") {
      addShape("linestrip", freehandPoints.map((p) => [p.x, p.y]));
      setFreehandPoints([]);
    }
  }, [addShape, freehandPoints, mode]);

  const cancelDrawing = useCallback(() => {
    setDragOrigin(null);
    setFreehandPoints([]);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (freehandPoints.length || dragOrigin) {
          cancelDrawing();
        } else if (selectedId !== null) {
          onSelectShape(null);
        }
      }
      if (e.key === "Enter" && (mode === "draw_polygon" || mode === "draw_linestrip")) {
        commitFreehandShape();
      }
    },
    [cancelDrawing, commitFreehandShape, dragOrigin, freehandPoints.length, mode, onSelectShape, selectedId],
  );

  const handleVertexDragMove = useCallback(
    (nodeId: string, vertexIndex: number, e: KonvaEventObject<MouseEvent>) => {
      const pos = stagePoint(e);
      if (!pos) return;
      if (!dragBaseRef.current) dragBaseRef.current = cloneShapes(shapes);
      if (readOnly) return;
      onShapesPreview(
        shapes.map((s) => {
          if (s.node_id !== nodeId) return s;
          const pts = [...s.points];
          pts[vertexIndex] = [pos.x, pos.y];
          if (s.shape_type === "rectangle" && pts.length === 2) {
            return { ...s, points: rectanglePoints({ x: pts[0][0], y: pts[0][1] }, { x: pts[1][0], y: pts[1][1] }) };
          }
          return { ...s, points: pts };
        }),
      );
    },
    [onShapesPreview, readOnly, shapes],
  );

  const handleVertexDragEnd = useCallback(() => {
    if (!readOnly && dragBaseRef.current) {
      onShapesChange(shapes, dragBaseRef.current);
      dragBaseRef.current = null;
    }
  }, [onShapesChange, readOnly, shapes]);

  const handleShapeDragStart = useCallback(
    (nodeId: string, e: KonvaEventObject<DragEvent>) => {
      const pos = stagePoint(e as unknown as KonvaEventObject<MouseEvent>);
      if (readOnly) return;
      if (!pos) return;
      shapeDragRef.current = { nodeId, start: pos, base: cloneShapes(shapes) };
    },
    [readOnly, shapes],
  );

  const handleShapeDragMove = useCallback(
    (nodeId: string, e: KonvaEventObject<DragEvent>) => {
      const drag = shapeDragRef.current;
      if (readOnly) return;
      const pos = stagePoint(e as unknown as KonvaEventObject<MouseEvent>);
      if (!drag || drag.nodeId !== nodeId || !pos) return;
      const dx = pos.x - drag.start.x;
      const dy = pos.y - drag.start.y;
      onShapesPreview(
        drag.base.map((shape) => (shape.node_id === nodeId ? translateShape(shape, dx, dy) : shape)),
      );
      if (e.target.className === "Line") {
        e.target.position({ x: 0, y: 0 });
      }
    },
    [onShapesPreview, readOnly],
  );

  const handleShapeDragEnd = useCallback(
    (nodeId: string) => {
      const drag = shapeDragRef.current;
      if (readOnly) return;
      if (!drag || drag.nodeId !== nodeId) return;
      onShapesChange(shapes, drag.base);
      shapeDragRef.current = null;
    },
    [onShapesChange, readOnly, shapes],
  );

  const handleInsertPoint = useCallback(
    (nodeId: string, point: Point) => {
      const target = shapes.find((shape) => shape.node_id === nodeId);
      if (readOnly) return;
      if (!target || (target.shape_type !== "polygon" && target.shape_type !== "linestrip")) return;
      const insertAt = nearestSegmentIndex(target.points, [point.x, point.y], target.shape_type === "polygon");
      const next = shapes.map((shape) =>
        shape.node_id === nodeId
          ? {
              ...shape,
              points: [
                ...shape.points.slice(0, insertAt + 1),
                [point.x, point.y] as [number, number],
                ...shape.points.slice(insertAt + 1),
              ],
            }
          : shape,
      );
      onShapesChange(next);
      setSelectedVertex({ nodeId, index: insertAt + 1 });
    },
    [onShapesChange, readOnly, shapes],
  );

  const handleMouseDownCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 1 && !(spacePressedRef.current && e.button === 0)) return;
    e.preventDefault();
    panRef.current = {
      x: e.clientX,
      y: e.clientY,
      left: scrollRef.current?.scrollLeft ?? 0,
      top: scrollRef.current?.scrollTop ?? 0,
    };
  }, []);

  const handleMouseMoveCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    const scrollEl = scrollRef.current;
    if (!pan || !scrollEl) return;
    scrollEl.scrollLeft = pan.left - (e.clientX - pan.x);
    scrollEl.scrollTop = pan.top - (e.clientY - pan.y);
  }, []);

  const stopPan = useCallback(() => {
    panRef.current = null;
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !isEditableElement(event.target)) {
        spacePressedRef.current = true;
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        spacePressedRef.current = false;
        panRef.current = null;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const edgeLines = buildEdgeLines(shapes);
  const dragPreview = dragOrigin && mousePos ? buildDragPreview(mode, dragOrigin, mousePos) : null;
  const freehandPreview =
    (mode === "draw_polygon" || mode === "draw_linestrip") && freehandPoints.length > 0
      ? freehandPoints
      : null;
  const detailId = mode === "select" ? hoveredId ?? selectedId : null;
  const detailIndex = shapes.findIndex((shape) => shape.node_id === detailId);
  const detailShape = detailIndex >= 0 ? shapes[detailIndex] : null;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseDownCapture={handleMouseDownCapture}
      onMouseMoveCapture={handleMouseMoveCapture}
      onMouseUpCapture={stopPan}
      onMouseLeave={stopPan}
      className="konva-container h-full w-full overflow-auto focus:outline-none"
    >
      <div ref={scrollRef} className="h-full w-full overflow-auto p-4">
      <Stage
        ref={stageRef}
        width={stageW * scale}
        height={stageH * scale}
        scaleX={scale}
        scaleY={scale}
        onMouseDown={handleStageMouseDown}
        onMouseUp={handleStageMouseUp}
        onMouseMove={handleMouseMove}
        onWheel={handleWheel}
      >
        <Layer>
          {bgImage ? (
            <KonvaImage
              image={bgImage}
              x={0}
              y={0}
              width={stageW}
              height={stageH}
              name="bg_rect"
              onClick={mode === "select" ? () => onSelectShape(null) : undefined}
            />
          ) : (
            <Rect
              name="bg_rect"
              x={0}
              y={0}
              width={stageW}
              height={stageH}
              fill="#f8f8f8"
              onClick={mode === "select" ? () => onSelectShape(null) : undefined}
            />
          )}
        </Layer>

        <Layer>
          {edgeLines.map((el, i) => (
            <EdgeRenderer key={`edge-${i}`} from={el.from} to={el.to} relation={el.relation} scale={scale} />
          ))}
        </Layer>

        <Layer>
          {shapes.map((shape, index) => (
            <ShapeRenderer
              key={shape.node_id}
              shape={shape}
              scale={scale}
              color={colorForIndex(index)}
              isSelected={shape.node_id === selectedId && mode === "select"}
              isHovered={shape.node_id === hoveredId && mode === "select"}
              hoverEnabled={mode === "select"}
              onSelect={() => {
                if (mode === "select") onSelectShape(shape.node_id);
              }}
              onHover={(id) => {
                if (mode === "select") setHoveredId(id);
              }}
              onShapeDragStart={handleShapeDragStart}
              onShapeDragMove={handleShapeDragMove}
              onShapeDragEnd={handleShapeDragEnd}
              onVertexDragMove={handleVertexDragMove}
              onVertexDragEnd={handleVertexDragEnd}
              onVertexSelect={(index) => setSelectedVertex({ nodeId: shape.node_id, index })}
              selectedVertexIndex={selectedVertex?.nodeId === shape.node_id ? selectedVertex.index : null}
              onInsertPoint={(point) => handleInsertPoint(shape.node_id, point)}
              readOnly={readOnly}
            />
          ))}
        </Layer>

        <Layer>
          {dragPreview && <PreviewRenderer preview={dragPreview} scale={scale} />}
          {freehandPreview && (
            <FreehandPreview
              mode={mode}
              points={freehandPreview}
              mousePos={mousePos}
              scale={scale}
            />
          )}
        </Layer>

        <Layer listening={false}>
          {detailShape && (
            <DetailPanel
              shape={detailShape}
              color={colorForIndex(detailIndex)}
              scale={scale}
              stageWidth={stageW}
              stageHeight={stageH}
            />
          )}
        </Layer>
      </Stage>
      </div>
    </div>
  );
});

export default Canvas;

function centroid(points: [number, number][]): Point {
  const n = Math.max(points.length, 1);
  return {
    x: points.reduce((s, p) => s + p[0], 0) / n,
    y: points.reduce((s, p) => s + p[1], 0) / n,
  };
}

function labelText(shape: ShapeData): string {
  return shape.node_id || shape.shape_type;
}

function buildEdgeLines(shapes: ShapeData[]): { from: Point; to: Point; relation: string }[] {
  const nodeIndex = new Map<string, ShapeData>();
  for (const s of shapes) nodeIndex.set(s.node_id, s);

  const lines: { from: Point; to: Point; relation: string }[] = [];
  for (const s of shapes) {
    for (const edge of s.edges) {
      const target = nodeIndex.get(edge.target);
      if (target) {
        lines.push({ from: centroid(s.points), to: centroid(target.points), relation: edge.relation });
      }
    }
  }
  return lines;
}

function buildDragPreview(mode: DrawMode, p1: Point, p2: Point) {
  if (mode === "draw_rect") return { type: "rectangle" as const, points: rectanglePoints(p1, p2) };
  if (mode === "draw_line") return { type: "line" as const, points: [[p1.x, p1.y], [p2.x, p2.y]] as [number, number][] };
  if (mode === "draw_circle") return { type: "circle" as const, points: [[p1.x, p1.y], [p2.x, p2.y]] as [number, number][] };
  return null;
}

function EdgeRenderer({ from, to, relation, scale }: { from: Point; to: Point; relation: string; scale: number }) {
  const sw = STROKE_WIDTH / scale;
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
        x={(from.x + to.x) / 2}
        y={(from.y + to.y) / 2}
        text={relation}
        fontSize={FONT_SIZE / scale}
        fill="#a33"
        fontStyle="bold"
      />
    </>
  );
}

function ShapeRenderer({
  shape,
  scale,
  color,
  isSelected,
  isHovered,
  hoverEnabled,
  onSelect,
  onHover,
  onShapeDragStart,
  onShapeDragMove,
  onShapeDragEnd,
  onVertexDragMove,
  onVertexDragEnd,
  onVertexSelect,
  selectedVertexIndex,
  onInsertPoint,
  readOnly,
}: {
  shape: ShapeData;
  scale: number;
  color: ShapeColor;
  isSelected: boolean;
  isHovered: boolean;
  hoverEnabled: boolean;
  onSelect: () => void;
  onHover: (id: string | null) => void;
  onShapeDragStart: (nodeId: string, e: KonvaEventObject<DragEvent>) => void;
  onShapeDragMove: (nodeId: string, e: KonvaEventObject<DragEvent>) => void;
  onShapeDragEnd: (nodeId: string) => void;
  onVertexDragMove: (nodeId: string, vi: number, e: KonvaEventObject<MouseEvent>) => void;
  onVertexDragEnd: () => void;
  onVertexSelect: (index: number) => void;
  selectedVertexIndex: number | null;
  onInsertPoint: (point: Point) => void;
  readOnly: boolean;
}) {
  if (shape.points.length === 0) return null;
  const sw = STROKE_WIDTH / scale;
  const fs = FONT_SIZE / scale;
  const stroke = color.stroke;
  const isActive = isSelected || isHovered;
  const fill = isActive ? color.selectedFill : color.fill;
  const firstP = shape.points[0];

  return (
    <>
      <ShapeGeometry
        shape={shape}
        stroke={stroke}
        fill={fill}
        strokeWidth={isActive ? sw * 1.5 : sw}
        onSelect={onSelect}
        onHover={onHover}
        hoverEnabled={hoverEnabled}
        draggable={isSelected && !readOnly}
        onDragStart={(e) => onShapeDragStart(shape.node_id, e)}
        onDragMove={(e) => onShapeDragMove(shape.node_id, e)}
        onDragEnd={() => onShapeDragEnd(shape.node_id)}
        onDblClick={(point) => onInsertPoint(point)}
        scale={scale}
      />
      <LabelTag
        text={labelText(shape)}
        anchorX={firstP[0]}
        anchorY={firstP[1] - 4 / scale}
        fontSize={fs}
        color={color}
      />
      {isSelected && !readOnly &&
        shape.points.map((p, i) => (
          <Circle
            key={i}
            x={p[0]}
            y={p[1]}
            radius={VERTEX_RADIUS / scale}
            fill="#fff"
            stroke={selectedVertexIndex === i ? "#111827" : stroke}
            strokeWidth={selectedVertexIndex === i ? sw * 1.8 : sw}
            draggable
            onClick={(e) => {
              e.cancelBubble = true;
              onVertexSelect(i);
            }}
            onDragMove={(e) => onVertexDragMove(shape.node_id, i, e)}
            onDragEnd={onVertexDragEnd}
          />
        ))}
    </>
  );
}

function ShapeGeometry({
  shape,
  stroke,
  fill,
  strokeWidth,
  onSelect,
  onHover,
  hoverEnabled,
  draggable,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDblClick,
  scale,
}: {
  shape: ShapeData;
  stroke: string;
  fill: string;
  strokeWidth: number;
  onSelect: () => void;
  onHover: (id: string | null) => void;
  hoverEnabled: boolean;
  draggable: boolean;
  onDragStart: (e: KonvaEventObject<DragEvent>) => void;
  onDragMove: (e: KonvaEventObject<DragEvent>) => void;
  onDragEnd: () => void;
  onDblClick: (point: Point) => void;
  scale: number;
}) {
  const points = shape.points;
  const hoverProps = hoverEnabled
    ? {
        onMouseEnter: () => onHover(shape.node_id),
        onMouseLeave: () => onHover(null),
      }
    : {};
  if (shape.shape_type === "rectangle" && points.length >= 2) {
    const [[x1, y1], [x2, y2]] = rectanglePoints({ x: points[0][0], y: points[0][1] }, { x: points[1][0], y: points[1][1] });
    return <Rect {...hoverProps} x={x1} y={y1} width={x2 - x1} height={y2 - y1} fill={fill} stroke={stroke} strokeWidth={strokeWidth} onClick={onSelect} draggable={draggable} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} />;
  }
  if (shape.shape_type === "circle" && points.length >= 2) {
    return <Circle {...hoverProps} x={points[0][0]} y={points[0][1]} radius={distance(points[0], points[1])} fill={fill} stroke={stroke} strokeWidth={strokeWidth} onClick={onSelect} draggable={draggable} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} />;
  }
  if (shape.shape_type === "point") {
    return <Circle {...hoverProps} x={points[0][0]} y={points[0][1]} radius={6 / scale} fill={stroke} stroke="#fff" strokeWidth={strokeWidth} onClick={onSelect} draggable={draggable} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} />;
  }
  const closed = shape.shape_type === "polygon";
  return (
    <Line
      {...hoverProps}
      points={points.flatMap((p) => [p[0], p[1]])}
      closed={closed}
      fill={closed ? fill : undefined}
      stroke={stroke}
      strokeWidth={strokeWidth}
      lineCap="round"
      lineJoin="round"
      onClick={onSelect}
      onDblClick={(e) => {
        const point = stagePointFromNode(e.target);
        if (point) onDblClick(point);
      }}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
    />
  );
}

function PreviewRenderer({
  preview,
  scale,
}: {
  preview: { type: "rectangle" | "line" | "circle"; points: [number, number][] } | null;
  scale: number;
}) {
  if (!preview) return null;
  const sw = STROKE_WIDTH / scale;
  if (preview.type === "rectangle") {
    const [[x1, y1], [x2, y2]] = preview.points;
    return <Rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} stroke="#2563eb" strokeWidth={sw} dash={[4 / scale, 3 / scale]} fill="rgba(37,99,235,0.06)" />;
  }
  if (preview.type === "circle") {
    return <Circle x={preview.points[0][0]} y={preview.points[0][1]} radius={distance(preview.points[0], preview.points[1])} stroke="#2563eb" strokeWidth={sw} dash={[4 / scale, 3 / scale]} fill="rgba(37,99,235,0.06)" />;
  }
  return <Line points={preview.points.flatMap((p) => [p[0], p[1]])} stroke="#2563eb" strokeWidth={sw} dash={[4 / scale, 3 / scale]} />;
}

function FreehandPreview({ mode, points, mousePos, scale }: { mode: DrawMode; points: Point[]; mousePos: Point | null; scale: number }) {
  const linePoints = mousePos ? [...points, mousePos] : points;
  return (
    <>
      <Line
        points={linePoints.flatMap((p) => [p.x, p.y])}
        stroke="#2563eb"
        strokeWidth={STROKE_WIDTH / scale}
        closed={mode === "draw_polygon" && points.length >= 3}
        fill={mode === "draw_polygon" ? "rgba(37,99,235,0.06)" : undefined}
        lineCap="round"
        lineJoin="round"
        dash={[4 / scale, 3 / scale]}
      />
      {points.map((p, i) => (
        <Circle
          key={i}
          x={p.x}
          y={p.y}
          radius={(i === 0 && mode === "draw_polygon" ? 7 : 4) / scale}
          fill={i === 0 ? "#16a34a" : "#2563eb"}
          stroke="#fff"
          strokeWidth={1 / scale}
        />
      ))}
    </>
  );
}

function shouldClosePolygon(points: Point[], pos: Point, scale: number): boolean {
  if (points.length < 3) return false;
  const first = points[0];
  return distance([first.x, first.y], [pos.x, pos.y]) <= 12 / scale;
}

function minPointsForShape(shapeType: ShapeType): number {
  if (shapeType === "polygon") return 3;
  if (shapeType === "linestrip" || shapeType === "rectangle" || shapeType === "line" || shapeType === "circle") {
    return 2;
  }
  return 1;
}

function nearestSegmentIndex(
  points: [number, number][],
  target: [number, number],
  closed: boolean,
): number {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  const segmentCount = closed ? points.length : points.length - 1;
  for (let i = 0; i < segmentCount; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const d = pointToSegmentDistance(target, a, b);
    if (d < bestDistance) {
      bestDistance = d;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function pointToSegmentDistance(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return distance(p, [a[0] + t * dx, a[1] + t * dy]);
}

function stagePointFromNode(node: Konva.Node): Point | null {
  const stage = node.getStage();
  const pos = stage?.getPointerPosition();
  if (!stage || !pos) return null;
  return stage.getAbsoluteTransform().copy().invert().point(pos);
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

function LabelTag({
  text,
  anchorX,
  anchorY,
  fontSize,
  color,
}: {
  text: string;
  anchorX: number;
  anchorY: number;
  fontSize: number;
  color: ShapeColor;
}) {
  if (!text) return null;
  const estW = text.length * fontSize * 0.6 + 8;
  const estH = fontSize * 1.4;
  return (
    <>
      <Rect
        x={anchorX}
        y={anchorY - estH}
        width={estW}
        height={estH}
        fill={color.labelFill}
        stroke={color.stroke}
        strokeWidth={0.7}
        cornerRadius={2}
      />
      <Text
        x={anchorX + 4}
        y={anchorY - estH + 2}
        text={text}
        fontSize={fontSize}
        fill="#fff"
        fontStyle="bold"
      />
    </>
  );
}

function DetailPanel({
  shape,
  color,
  scale,
  stageWidth,
  stageHeight,
}: {
  shape: ShapeData;
  color: ShapeColor;
  scale: number;
  stageWidth: number;
  stageHeight: number;
}) {
  const rows = detailRows(shape);
  const pad = 8 / scale;
  const lineHeight = 18 / scale;
  const panelWidth = 360 / scale;
  const panelHeight = (rows.length * 2 + 4) * lineHeight + pad * 2;
  const bounds = shapeBounds(shape);
  const gap = 12 / scale;
  const rightX = bounds.maxX + gap;
  const leftX = bounds.minX - panelWidth - gap;
  const x = rightX + panelWidth <= stageWidth ? rightX : Math.max(0, leftX);
  const y = Math.min(Math.max(0, bounds.minY), Math.max(0, stageHeight - panelHeight));

  return (
    <>
      <Rect
        x={x}
        y={y}
        width={panelWidth}
        height={panelHeight}
        fill="rgba(255,255,255,0.96)"
        stroke={color.stroke}
        strokeWidth={1.5 / scale}
        shadowColor="rgba(0,0,0,0.25)"
        shadowBlur={8 / scale}
        shadowOffset={{ x: 2 / scale, y: 2 / scale }}
        cornerRadius={4 / scale}
      />
      <Rect
        x={x}
        y={y}
        width={panelWidth}
        height={24 / scale}
        fill={color.labelFill}
        cornerRadius={4 / scale}
      />
      <Text
        x={x + pad}
        y={y + 5 / scale}
        text="{"
        fontSize={14 / scale}
        fontFamily="monospace"
        fontStyle="bold"
        fill="#fff"
      />
      {rows.flatMap((row, index) => {
        const rowY = y + 30 / scale + index * lineHeight * 2;
        return [
          <Text
            key={`${row.key}-key`}
            x={x + pad}
            y={rowY}
            text={`"${row.key}":`}
            fontSize={13 / scale}
            fontFamily="monospace"
            fill="#2563eb"
          />,
          <Text
            key={`${row.key}-value`}
            x={x + 150 / scale}
            y={rowY}
            width={panelWidth - 158 / scale}
            text={row.value}
            fontSize={13 / scale}
            fontFamily="monospace"
            fill="#7c2d12"
            wrap="word"
          />,
        ];
      })}
      <Text
        x={x + pad}
        y={y + panelHeight - 22 / scale}
        text="}"
        fontSize={14 / scale}
        fontFamily="monospace"
        fontStyle="bold"
        fill="#44403c"
      />
    </>
  );
}

function detailRows(shape: ShapeData): { key: string; value: string }[] {
  return [
    { key: "node_id", value: jsonValue(shape.node_id) },
    { key: "group_id", value: jsonValue(shape.group_id) },
    { key: "type", value: jsonValue(shape.type || shape.label) },
    { key: "shape_type", value: jsonValue(shape.shape_type) },
    { key: "transcription_raw", value: jsonValue(shape.transcription_raw) },
    { key: "transcription_semantic", value: jsonValue(shape.transcription_semantic) },
    { key: "points", value: `[${shape.points.length} points]` },
    {
      key: "attributes",
      value: `{ z_index: ${shape.attributes.z_index}, color: ${shape.attributes.color}, vague: ${shape.attributes.vague}, reading_direction: ${shape.attributes.reading_direction} }`,
    },
    { key: "edges", value: `[${shape.edges.length}]` },
  ];
}

function jsonValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return `"${value}"`;
  return String(value);
}

function shapeBounds(shape: ShapeData): { minX: number; minY: number; maxX: number; maxY: number } {
  if (shape.points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  if (shape.shape_type === "circle" && shape.points.length >= 2) {
    const [center, edge] = shape.points;
    const radius = distance(center, edge);
    return {
      minX: center[0] - radius,
      minY: center[1] - radius,
      maxX: center[0] + radius,
      maxY: center[1] + radius,
    };
  }
  const xs = shape.points.map((point) => point[0]);
  const ys = shape.points.map((point) => point[1]);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

interface ShapeColor {
  stroke: string;
  fill: string;
  selectedFill: string;
  labelFill: string;
}

const SHAPE_COLORS: ShapeColor[] = [
  { stroke: "#dc2626", fill: "rgba(220,38,38,0.08)", selectedFill: "rgba(220,38,38,0.32)", labelFill: "#dc2626" },
  { stroke: "#2563eb", fill: "rgba(37,99,235,0.08)", selectedFill: "rgba(37,99,235,0.32)", labelFill: "#2563eb" },
  { stroke: "#16a34a", fill: "rgba(22,163,74,0.08)", selectedFill: "rgba(22,163,74,0.32)", labelFill: "#16a34a" },
  { stroke: "#ca8a04", fill: "rgba(202,138,4,0.1)", selectedFill: "rgba(202,138,4,0.34)", labelFill: "#ca8a04" },
  { stroke: "#9333ea", fill: "rgba(147,51,234,0.08)", selectedFill: "rgba(147,51,234,0.32)", labelFill: "#9333ea" },
  { stroke: "#0891b2", fill: "rgba(8,145,178,0.08)", selectedFill: "rgba(8,145,178,0.32)", labelFill: "#0891b2" },
  { stroke: "#ea580c", fill: "rgba(234,88,12,0.08)", selectedFill: "rgba(234,88,12,0.32)", labelFill: "#ea580c" },
  { stroke: "#be123c", fill: "rgba(190,18,60,0.08)", selectedFill: "rgba(190,18,60,0.32)", labelFill: "#be123c" },
];

function colorForIndex(index: number): ShapeColor {
  return SHAPE_COLORS[index % SHAPE_COLORS.length];
}
