/** A number input that lets you type freely and only commits valid, finite values. */
import { useState } from 'react';

export function NumberField({
  label,
  value,
  onCommit,
  unit,
  min,
  testId,
}: {
  label: string;
  value: number;
  onCommit(value: number): void;
  unit: string;
  /** Values at or below this are refused. */
  min?: number;
  testId?: string;
}) {
  const [text, setText] = useState(String(value));
  const [lastValue, setLastValue] = useState(value);

  // Show changes from outside, such as dragging the shape, without replacing what's being typed.
  if (value !== lastValue) {
    setText(String(value));
    setLastValue(value);
  }

  const parsed = text.trim() === '' ? Number.NaN : Number(text);
  const valid = Number.isFinite(parsed) && (min === undefined || parsed > min);

  function commit() {
    if (valid) {
      if (parsed !== value) {
        setLastValue(parsed);
        onCommit(parsed);
      }
    } else {
      setText(String(value));
    }
  }

  return (
    <label className={`number-field ${valid ? '' : 'invalid'}`}>
      <span>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        data-testid={testId}
        aria-invalid={!valid}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
      <em>{unit}</em>
    </label>
  );
}
