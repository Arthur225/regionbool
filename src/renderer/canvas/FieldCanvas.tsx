/**
 * The field map. The SVG viewBox is in meters, so shapes are drawn at their real coordinates and
 * the browser handles scaling. WPILib's +y points up the screen and SVG's points down, so `sy` is
 * the only place that conversion happens. Handles need a constant size on screen, so their sizes
 * are divided by `pixelsPerMeter`.
 */
import { useEffect, useRef, useState } from 'react';
import type { MouseEvent, PointerEvent } from 'react';
import type { Point, PolygonShape, Region, Shape } from '../../shared/model';
import {
  circleFromDrag,
  clampToField,
  insertVertex,
  moveVertex,
  rectCorners,
  rectFromDrag,
  removeVertex,
  resizeCircle,
  resizeRectCorner,
  rotateShape,
  shapeCenter,
  snapPoint,
  snapValue,
  translateShape,
} from '../../shared/shapeOps';
import { useEditor } from '../store';

interface LoadedImage {
  fieldId: string;
  url: string;
  width: number;
  height: number;
}

const MARGIN_METERS = 0.6;
const HANDLE_PIXELS = 6;
const ROTATE_HANDLE_OFFSET_PIXELS = 28;
const CLOSE_POLYGON_PIXELS = 12;
const ROTATION_SNAP_DEGREES = 15;

const REGION_COLORS = [
  '#E9B50B',
  '#4CB4FF',
  '#F0653A',
  '#2BD4A7',
  '#D56BFF',
  '#9FE03C',
  '#FF6FA8',
  '#8C9BFF',
];

/** Returns a region's display color, which depends only on its position in the list. */
export function regionColor(index: number): string {
  return REGION_COLORS[index % REGION_COLORS.length]!;
}

/** A drag in progress. Each holds what it started from, so movement never accumulates error. */
type Gesture =
  | { type: 'draw-rect' | 'draw-circle'; start: Point }
  | { type: 'move'; shape: Shape; start: Point }
  | { type: 'rotate'; shape: Shape; center: Point; startAngle: number }
  | { type: 'corner'; shape: Extract<Shape, { kind: 'rect' }>; corner: number }
  | { type: 'radius'; shape: Extract<Shape, { kind: 'circle' }> }
  | { type: 'vertex'; shape: PolygonShape; index: number };

function pointsAttr(points: readonly Point[], sy: (y: number) => number): string {
  return points.map((p) => `${p.x},${sy(p.y)}`).join(' ');
}

function ShapeOutline({
  shape,
  sy,
  ...props
}: { shape: Shape; sy: (y: number) => number } & React.SVGProps<
  SVGCircleElement & SVGPolygonElement
>) {
  if (shape.kind === 'circle') {
    return <circle cx={shape.cx} cy={sy(shape.cy)} r={shape.radius} {...props} />;
  }
  const points = shape.kind === 'rect' ? rectCorners(shape) : shape.points;
  return <polygon points={pointsAttr(points, sy)} {...props} />;
}

function shapeSize(shape: Shape): number {
  if (shape.kind === 'circle') return shape.radius;
  const points = shape.kind === 'rect' ? rectCorners(shape) : shape.points;
  const center = shapeCenter(shape);
  return Math.max(...points.map((p) => Math.hypot(p.x - center.x, p.y - center.y)));
}

/** Where a shape's rotate handle sits: beyond its local top edge for rectangles, otherwise above it. */
function rotateHandlePosition(shape: Shape, offset: number): Point {
  const center = shapeCenter(shape);
  if (shape.kind === 'rect') {
    const radians = (shape.rotationDeg * Math.PI) / 180;
    const distance = shape.height / 2 + offset;
    return {
      x: center.x - Math.sin(radians) * distance,
      y: center.y + Math.cos(radians) * distance,
    };
  }
  return { x: center.x, y: center.y + shapeSize(shape) + offset };
}

function RegionFill({
  region,
  index,
  sy,
  prefix,
}: {
  region: Region;
  index: number;
  sy: (y: number) => number;
  prefix: string;
}) {
  const color = regionColor(index);
  const maskId = `${prefix}-mask-${region.id}`;
  const adds = region.shapes.filter((shape) => shape.mode === 'add');
  const holes = region.shapes.filter((shape) => shape.mode === 'subtract');
  return (
    <>
      {/* A mask shows exactly the area that counts as inside: added shapes minus holes. */}
      <mask id={maskId} maskUnits="userSpaceOnUse" x="-100" y="-100" width="300" height="300">
        {adds.map((shape) => (
          <ShapeOutline key={shape.id} shape={shape} sy={sy} fill="white" />
        ))}
        {holes.map((shape) => (
          <ShapeOutline key={shape.id} shape={shape} sy={sy} fill="black" />
        ))}
      </mask>
      <rect
        x="-100"
        y="-100"
        width="300"
        height="300"
        fill={color}
        fillOpacity={0.32}
        mask={`url(#${maskId})`}
        pointerEvents="none"
      />
    </>
  );
}

export function FieldCanvas() {
  const svgRef = useRef<SVGSVGElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  // Pointer capture makes later events report the SVG as their target, so remember what was pressed.
  const pressedRef = useRef<Element | null>(null);
  const [pixelsPerMeter, setPixelsPerMeter] = useState(50);
  const [dragDraft, setDragDraft] = useState<Shape | null>(null);
  const [loadedImage, setLoadedImage] = useState<LoadedImage | null>(null);

  const doc = useEditor((s) => s.doc);
  const tool = useEditor((s) => s.tool);
  const drawMode = useEditor((s) => s.drawMode);
  const selectedRegionId = useEditor((s) => s.selectedRegionId);
  const selectedShapeId = useEditor((s) => s.selectedShapeId);
  const draftPoints = useEditor((s) => s.draftPoints);
  const cursor = useEditor((s) => s.cursor);
  const fields = useEditor((s) => s.fields);

  const { field, regions } = doc;
  const { lengthMeters: length, widthMeters: width } = field;
  const sy = (y: number) => width - y;
  const unit = 1 / pixelsPerMeter;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const matrix = svg.getScreenCTM();
      if (matrix && matrix.a > 0) setPixelsPerMeter(matrix.a);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [length, width]);

  // Decoding the image gives its full size, which placing it on the field requires.
  const fieldId = field.fieldId;
  const definition = fields?.find((candidate) => candidate.id === fieldId) ?? null;
  useEffect(() => {
    if (!fieldId) return;
    let current = true;
    void window.regionbool.getFieldImage(fieldId).then((url) => {
      if (!url || !current) return;
      const image = new Image();
      image.onload = () => {
        if (current) {
          setLoadedImage({ fieldId, url, width: image.naturalWidth, height: image.naturalHeight });
        }
      };
      image.src = url;
    });
    return () => {
      current = false;
    };
  }, [fieldId, fields]);

  const backgroundImage = definition && loadedImage?.fieldId === definition.id ? loadedImage : null;
  const imageScaleX = definition
    ? length / (definition.bottomRightPixel[0] - definition.topLeftPixel[0])
    : 1;
  const imageScaleY = definition
    ? width / (definition.bottomRightPixel[1] - definition.topLeftPixel[1])
    : 1;

  const selectedRegion = regions.find((region) => region.id === selectedRegionId) ?? null;
  const selectedShape =
    selectedRegion?.shapes.find((shape) => shape.id === selectedShapeId) ?? null;

  function toField(event: { clientX: number; clientY: number }): Point {
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: width - point.y };
  }

  function grid(): number | null {
    const { snapEnabled, gridMeters } = useEditor.getState();
    return snapEnabled ? gridMeters : null;
  }

  function finishPolygon(points: Point[]) {
    const editor = useEditor.getState();
    if (points.length >= 3) {
      const kind = points.length === 3 && editor.tool === 'triangle' ? 'triangle' : 'polygon';
      editor.addShape({ kind, points });
    }
    editor.setDraftPoints([]);
    editor.setTool('select');
  }

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    pressedRef.current = event.target as Element;
    const editor = useEditor.getState();
    const raw = toField(event);

    if (editor.tool === 'rect' || editor.tool === 'circle') {
      gestureRef.current = {
        type: editor.tool === 'rect' ? 'draw-rect' : 'draw-circle',
        start: snapPoint(clampToField(raw, field), grid()),
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (editor.tool !== 'select') return;

    const target = event.target as Element;
    const handle = target.closest('[data-handle]')?.getAttribute('data-handle');
    if (handle && selectedShape) {
      const [type, indexText] = handle.split(':');
      const index = Number(indexText);
      if (type === 'corner' && selectedShape.kind === 'rect') {
        gestureRef.current = { type: 'corner', shape: selectedShape, corner: index };
      } else if (type === 'radius' && selectedShape.kind === 'circle') {
        gestureRef.current = { type: 'radius', shape: selectedShape };
      } else if (
        type === 'vertex' &&
        (selectedShape.kind === 'triangle' || selectedShape.kind === 'polygon')
      ) {
        gestureRef.current = { type: 'vertex', shape: selectedShape, index };
      } else if (type === 'rotate') {
        const center = shapeCenter(selectedShape);
        gestureRef.current = {
          type: 'rotate',
          shape: selectedShape,
          center,
          startAngle: Math.atan2(raw.y - center.y, raw.x - center.x),
        };
      }
      editor.beginGesture();
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    // An edge belongs to the selected polygon, so clicking one mustn't deselect it. Otherwise the
    // first click of a double-click on an edge would remove what the second click needs.
    if (target.closest('[data-edge]') && selectedShape) {
      gestureRef.current = { type: 'move', shape: selectedShape, start: raw };
      editor.beginGesture();
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    const shapeElement = target.closest('[data-shape-id]');
    if (shapeElement) {
      const shapeId = shapeElement.getAttribute('data-shape-id');
      const region = regions.find((candidate) =>
        candidate.shapes.some((shape) => shape.id === shapeId),
      );
      const shape = region?.shapes.find((candidate) => candidate.id === shapeId);
      if (region && shape) {
        editor.select(region.id, shape.id);
        gestureRef.current = { type: 'move', shape, start: raw };
        editor.beginGesture();
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      return;
    }
    editor.select(editor.selectedRegionId, null);
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const editor = useEditor.getState();
    const raw = toField(event);
    editor.setCursor(raw);

    const gesture = gestureRef.current;
    if (!gesture) return;
    const point = snapPoint(raw, grid());

    switch (gesture.type) {
      case 'draw-rect': {
        const shape = rectFromDrag(gesture.start, snapPoint(clampToField(raw, field), grid()));
        setDragDraft(shape && { ...shape, id: 'draft', mode: editor.drawMode });
        break;
      }
      case 'draw-circle': {
        const shape = circleFromDrag(gesture.start, snapPoint(raw, grid()));
        setDragDraft(shape && { ...shape, id: 'draft', mode: editor.drawMode });
        break;
      }
      case 'move': {
        const step = grid();
        const dx = snapValue(raw.x - gesture.start.x, step);
        const dy = snapValue(raw.y - gesture.start.y, step);
        editor.updateShape(translateShape(gesture.shape, dx, dy));
        break;
      }
      case 'rotate': {
        const angle = Math.atan2(raw.y - gesture.center.y, raw.x - gesture.center.x);
        const degrees = ((angle - gesture.startAngle) * 180) / Math.PI;
        const snapped =
          grid() === null
            ? degrees
            : Math.round(degrees / ROTATION_SNAP_DEGREES) * ROTATION_SNAP_DEGREES;
        editor.updateShape(rotateShape(gesture.shape, snapped));
        break;
      }
      case 'corner':
        editor.updateShape(resizeRectCorner(gesture.shape, gesture.corner, point));
        break;
      case 'radius':
        editor.updateShape(resizeCircle(gesture.shape, point));
        break;
      case 'vertex':
        editor.updateShape(moveVertex(gesture.shape, gesture.index, point));
        break;
    }
  }

  function onPointerUp(event: PointerEvent<SVGSVGElement>) {
    const gesture = gestureRef.current;
    if (!gesture) return;
    gestureRef.current = null;
    const editor = useEditor.getState();
    if (gesture.type === 'draw-rect' || gesture.type === 'draw-circle') {
      const end = snapPoint(
        gesture.type === 'draw-rect' ? clampToField(toField(event), field) : toField(event),
        grid(),
      );
      const shape =
        gesture.type === 'draw-rect'
          ? rectFromDrag(gesture.start, end)
          : circleFromDrag(gesture.start, end);
      setDragDraft(null);
      if (shape) {
        editor.addShape(shape);
        editor.setTool('select');
      }
    } else {
      editor.endGesture();
    }
  }

  /** Places triangle and polygon vertices. Uses click because it reports double-clicks. */
  function onClick(event: MouseEvent<SVGSVGElement>) {
    const editor = useEditor.getState();
    if (editor.tool !== 'triangle' && editor.tool !== 'polygon') return;
    const points = editor.draftPoints;

    if (editor.tool === 'polygon' && event.detail >= 2) {
      finishPolygon(points);
      return;
    }
    const raw = toField(event);
    const first = points[0];
    if (
      editor.tool === 'polygon' &&
      first &&
      points.length >= 3 &&
      Math.hypot(raw.x - first.x, raw.y - first.y) * pixelsPerMeter <= CLOSE_POLYGON_PIXELS
    ) {
      finishPolygon(points);
      return;
    }
    const next = [...points, snapPoint(clampToField(raw, field), grid())];
    if (editor.tool === 'triangle' && next.length === 3) {
      finishPolygon(next);
    } else {
      editor.setDraftPoints(next);
    }
  }

  /** Double-clicking a polygon's vertex removes it, and double-clicking an edge adds one. */
  function onDoubleClick(event: MouseEvent<SVGSVGElement>) {
    if (tool !== 'select' || selectedShape?.kind !== 'polygon') return;
    const target = pressedRef.current;
    const handle = target?.closest('[data-handle]')?.getAttribute('data-handle');
    const edge = target?.closest('[data-edge]')?.getAttribute('data-edge');
    const editor = useEditor.getState();
    if (handle?.startsWith('vertex:')) {
      editor.updateShape(removeVertex(selectedShape, Number(handle.split(':')[1])));
    } else if (edge) {
      editor.updateShape(
        insertVertex(selectedShape, Number(edge), snapPoint(toField(event), grid())),
      );
    }
  }

  const verticalLines = Array.from({ length: Math.floor(length) + 1 }, (_, i) => i);
  const horizontalLines = Array.from({ length: Math.floor(width) + 1 }, (_, i) => i);
  const previewPoints =
    cursor && draftPoints.length > 0
      ? [
          ...draftPoints,
          snapPoint(
            clampToField(cursor, field),
            useEditor.getState().snapEnabled ? useEditor.getState().gridMeters : null,
          ),
        ]
      : draftPoints;

  return (
    <svg
      ref={svgRef}
      className={`field-canvas tool-${tool} ${backgroundImage ? 'has-image' : ''}`}
      data-fields-loaded={fields !== null}
      data-testid="field-canvas"
      data-field-width={width}
      viewBox={`${-MARGIN_METERS} ${-MARGIN_METERS} ${length + MARGIN_METERS * 2} ${width + MARGIN_METERS * 2}`}
      preserveAspectRatio="xMidYMid meet"
      role="application"
      aria-label="Field map"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => useEditor.getState().setCursor(null)}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {/* Field and alliance walls */}
      <rect x="0" y="0" width={length} height={width} className="field-surface" />
      {backgroundImage && definition && (
        <image
          data-rotated={definition.imageRotated}
          href={backgroundImage.url}
          data-testid="field-image"
          x={-definition.topLeftPixel[0] * imageScaleX}
          y={-definition.topLeftPixel[1] * imageScaleY}
          width={backgroundImage.width * imageScaleX}
          height={backgroundImage.height * imageScaleY}
          preserveAspectRatio="none"
          pointerEvents="none"
          // The corners map onto the whole field, so turning about its center keeps them aligned.
          {...(definition.imageRotated && { transform: `rotate(180 ${length / 2} ${width / 2})` })}
        />
      )}
      {verticalLines.map((x) => (
        <line
          key={x}
          x1={x}
          x2={x}
          y1={0}
          y2={width}
          className={x % 5 === 0 ? 'grid-major' : 'grid-minor'}
        />
      ))}
      {horizontalLines.map((y) => (
        <line
          key={y}
          x1={0}
          x2={length}
          y1={sy(y)}
          y2={sy(y)}
          className={y % 5 === 0 ? 'grid-major' : 'grid-minor'}
        />
      ))}
      <rect x={-unit * 6} y="0" width={unit * 6} height={width} className="wall-blue" />
      <rect x={length} y="0" width={unit * 6} height={width} className="wall-red" />
      <text x={unit * 10} y={width - unit * 10} fontSize={unit * 12} className="field-label">
        (0, 0)
      </text>
      <text
        x={length - unit * 10}
        y={unit * 22}
        fontSize={unit * 12}
        textAnchor="end"
        className="field-label"
      >
        ({length}, {width})
      </text>

      {/* Filled areas */}
      {regions.map((region, index) => (
        <RegionFill key={region.id} region={region} index={index} sy={sy} prefix="fill" />
      ))}

      {/* Outlines, which also receive clicks */}
      {regions.map((region, index) =>
        // Holes go last so they stay clickable when they're inside another shape.
        [...region.shapes]
          .sort((a, b) => Number(a.mode === 'subtract') - Number(b.mode === 'subtract'))
          .map((shape) => (
            <ShapeOutline
              key={shape.id}
              shape={shape}
              sy={sy}
              data-shape-id={shape.id}
              data-testid={`shape-${shape.kind}`}
              className={`shape-outline ${shape.mode === 'subtract' ? 'shape-hole' : ''} ${shape.id === selectedShapeId ? 'shape-selected' : ''}`}
              stroke={regionColor(index)}
              fill="transparent"
            />
          )),
      )}

      {/* Shape being drawn */}
      {dragDraft && (
        <ShapeOutline
          shape={dragDraft}
          sy={sy}
          className={`shape-draft ${drawMode === 'subtract' ? 'shape-hole' : ''}`}
          fill="transparent"
        />
      )}
      {draftPoints.length > 0 && (
        <>
          <polyline points={pointsAttr(previewPoints, sy)} className="shape-draft" fill="none" />
          {draftPoints.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={sy(p.y)}
              r={HANDLE_PIXELS * unit * 0.8}
              className="draft-vertex"
            />
          ))}
        </>
      )}

      {/* Handles for the selected shape */}
      {selectedShape && tool === 'select' && (
        <g>
          {selectedShape.kind === 'polygon' &&
            selectedShape.points.map((p, i) => {
              const next = selectedShape.points[(i + 1) % selectedShape.points.length]!;
              return (
                <line
                  key={i}
                  x1={p.x}
                  y1={sy(p.y)}
                  x2={next.x}
                  y2={sy(next.y)}
                  data-edge={i}
                  className="edge-hit"
                />
              );
            })}
          {selectedShape.kind === 'rect' &&
            rectCorners(selectedShape).map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={sy(p.y)}
                r={HANDLE_PIXELS * unit}
                data-handle={`corner:${i}`}
                className="handle"
              />
            ))}
          {selectedShape.kind === 'circle' && (
            <circle
              cx={selectedShape.cx + selectedShape.radius}
              cy={sy(selectedShape.cy)}
              r={HANDLE_PIXELS * unit}
              data-handle="radius:0"
              className="handle"
            />
          )}
          {(selectedShape.kind === 'triangle' || selectedShape.kind === 'polygon') &&
            selectedShape.points.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={sy(p.y)}
                r={HANDLE_PIXELS * unit}
                data-handle={`vertex:${i}`}
                className="handle"
              />
            ))}
          {selectedShape.kind !== 'circle' &&
            (() => {
              const handle = rotateHandlePosition(
                selectedShape,
                ROTATE_HANDLE_OFFSET_PIXELS * unit,
              );
              return (
                <circle
                  cx={handle.x}
                  cy={sy(handle.y)}
                  r={HANDLE_PIXELS * unit}
                  data-handle="rotate:0"
                  data-testid="rotate-handle"
                  className="handle handle-rotate"
                />
              );
            })()}
        </g>
      )}
    </svg>
  );
}
