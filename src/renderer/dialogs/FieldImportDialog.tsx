/** Imports the user's own field image: they mark where the field is, and enter its real size. */
import { useState } from 'react';
import type { MouseEvent } from 'react';
import type { FieldSymmetry } from '../../shared/model';
import { fieldInfoFrom, refreshFields } from '../actions';
import { NumberField } from '../panels/NumberField';
import { useEditor } from '../store';

type Pixel = [number, number];

export function FieldImportDialog({
  image,
  onClose,
}: {
  image: { fileName: string; dataUrl: string };
  onClose(): void;
}) {
  const field = useEditor((s) => s.doc.field);
  const [name, setName] = useState(image.fileName.replace(/\.[^.]+$/, ''));
  const [length, setLength] = useState(field.lengthMeters);
  const [width, setWidth] = useState(field.widthMeters);
  const [symmetry, setSymmetry] = useState<FieldSymmetry>(field.symmetry);
  const [redOnLeft, setRedOnLeft] = useState(false);
  const [corners, setCorners] = useState<Pixel[]>([]);
  const [imageSize, setImageSize] = useState<Pixel | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Records a click in the image's own pixels, whatever size it's displayed at. A third click restarts. */
  function onImageClick(event: MouseEvent<HTMLDivElement>) {
    if (!imageSize) return;
    const box = event.currentTarget.getBoundingClientRect();
    const pixel: Pixel = [
      Math.round(((event.clientX - box.left) / box.width) * imageSize[0]),
      Math.round(((event.clientY - box.top) / box.height) * imageSize[1]),
    ];
    setCorners(corners.length >= 2 ? [pixel] : [...corners, pixel]);
  }

  const [first, second] = corners;
  // Corners can be clicked in either order, so sort them into top left and bottom right.
  const box =
    first && second
      ? {
          left: Math.min(first[0], second[0]),
          top: Math.min(first[1], second[1]),
          right: Math.max(first[0], second[0]),
          bottom: Math.max(first[1], second[1]),
        }
      : null;
  const hasArea = box !== null && box.right > box.left && box.bottom > box.top;

  const percent = (value: number, axis: 0 | 1) =>
    imageSize ? `${(value / imageSize[axis]) * 100}%` : '0%';

  async function save() {
    if (!box || !hasArea) return;
    const result = await window.regionbool.saveCustomField({
      name,
      lengthMeters: length,
      widthMeters: width,
      symmetry,
      imageRotated: redOnLeft,
      topLeftPixel: [box.left, box.top],
      bottomRightPixel: [box.right, box.bottom],
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    await refreshFields();
    const editor = useEditor.getState();
    editor.setField(fieldInfoFrom(result.field, editor.doc.field));
    onClose();
  }

  return (
    <div className="dialog-backdrop">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Import field image"
        data-testid="import-dialog"
      >
        <h2>Import field image</h2>
        <p>
          Click two opposite corners of the field&apos;s carpet. The app saves a copy in your
          project so your team gets it too.
        </p>

        <div className="import-image" data-testid="import-image" onClick={onImageClick}>
          <img
            src={image.dataUrl}
            alt=""
            draggable={false}
            onLoad={(event) =>
              setImageSize([event.currentTarget.naturalWidth, event.currentTarget.naturalHeight])
            }
          />
          {box && (
            <div
              className="import-outline"
              style={{
                left: percent(box.left, 0),
                top: percent(box.top, 1),
                width: percent(box.right - box.left, 0),
                height: percent(box.bottom - box.top, 1),
              }}
            />
          )}
          {corners.map((corner, index) => (
            <div
              key={index}
              className="import-marker"
              style={{ left: percent(corner[0], 0), top: percent(corner[1], 1) }}
            />
          ))}
        </div>

        <div className="dialog-grid">
          <label className="text-field">
            Name
            <input
              data-testid="import-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <NumberField
            label="Length"
            unit="m"
            min={0}
            testId="import-length"
            value={length}
            onCommit={setLength}
          />
          <NumberField
            label="Width"
            unit="m"
            min={0}
            testId="import-width"
            value={width}
            onCommit={setWidth}
          />
          <label className="text-field">
            Red side
            <select
              aria-label="Imported field symmetry"
              value={symmetry}
              onChange={(event) => setSymmetry(event.target.value as FieldSymmetry)}
            >
              <option value="rotational">Rotated 180°</option>
              <option value="mirrored">Mirrored</option>
            </select>
          </label>
        </div>

        <label className="checkbox-field">
          <input
            type="checkbox"
            data-testid="import-red-on-left"
            checked={redOnLeft}
            onChange={(event) => setRedOnLeft(event.target.checked)}
          />
          This image shows the red alliance on the left, so turn it to match field coordinates
        </label>

        {error && (
          <p className="dialog-error" role="alert" data-testid="import-error">
            {error}
          </p>
        )}

        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={!hasArea || !name.trim()}
            onClick={() => void save()}
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
