interface Props {
  markupMode: boolean;
  onToggleMarkup: () => void;
  strokeColor: string;
  onStrokeColorChange: (c: string) => void;
  strokeWidth: number;
  onStrokeWidthChange: (w: number) => void;
  onClear: () => void;
  onUndo: () => void;
  canUndo: boolean;
}

export function Toolbar({
  markupMode,
  onToggleMarkup,
  strokeColor,
  onStrokeColorChange,
  strokeWidth,
  onStrokeWidthChange,
  onClear,
  onUndo,
  canUndo,
}: Props) {
  return (
    <div className="toolbar">
      <button
        className={markupMode ? "active" : ""}
        onClick={onToggleMarkup}
      >
        {markupMode ? "✏️ Markup ON" : "✏️ Markup"}
      </button>

      {markupMode && (
        <>
          <div className="separator" />
          <label>
            Kolor
            <input
              type="color"
              value={strokeColor}
              onChange={(e) => onStrokeColorChange(e.target.value)}
            />
          </label>
          <label>
            Grubość
            <input
              type="range"
              min={1}
              max={20}
              value={strokeWidth}
              onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
            />
            <span>{strokeWidth}px</span>
          </label>
          <div className="separator" />
          <button onClick={onUndo} disabled={!canUndo}>
            ↩ Cofnij
          </button>
          <button onClick={onClear} disabled={!canUndo}>
            🗑 Wyczyść
          </button>
        </>
      )}
    </div>
  );
}
