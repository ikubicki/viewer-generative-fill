import { useState, useEffect } from "react";
import type { FillSession } from "../types";
import { getCheckpoints } from "../services/comfyui";

interface Props {
  session: FillSession;
  onGenerate: (prompt: string, checkpoint: string) => void;
  onAccept: () => void;
  onRegenerate: (prompt: string, checkpoint: string) => void;
  onCancel: () => void;
}

export function GenerativeFillPanel({
  session,
  onGenerate,
  onAccept,
  onRegenerate,
  onCancel,
}: Props) {
  const [prompt, setPrompt] = useState("");
  const [checkpoints, setCheckpoints] = useState<string[]>([]);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState("");
  const [loadingModels, setLoadingModels] = useState(true);

  useEffect(() => {
    getCheckpoints()
      .then((list) => {
        setCheckpoints(list);
        if (list.length > 0) setSelectedCheckpoint(list[0]);
      })
      .catch(() => setCheckpoints([]))
      .finally(() => setLoadingModels(false));
  }, []);

  const hasResult = !!session.result;
  const isGenerating = session.isGenerating;
  const canGenerate = prompt.trim() && selectedCheckpoint && !isGenerating;

  const doGenerate = () => {
    if (!canGenerate) return;
    onGenerate(prompt.trim(), selectedCheckpoint);
  };

  const doRegenerate = () => {
    if (!canGenerate) return;
    onRegenerate(prompt.trim(), selectedCheckpoint);
  };

  return (
    <div className="gf-panel">
      <div className="gf-header">
        <h3>Generative Fill</h3>
        <button className="gf-close" onClick={onCancel} title="Zamknij">
          ✕
        </button>
      </div>

      <div className="gf-preview">
        {hasResult ? (
          <img
            src={session.result}
            alt="Generated result"
            className="gf-preview-img"
            draggable={false}
          />
        ) : (
          <img
            src={session.crop}
            alt="Selected region"
            className="gf-preview-img"
            draggable={false}
          />
        )}
      </div>

      <div className="gf-model-select">
        <label>
          Model
          {loadingModels ? (
            <span className="gf-model-loading">ładowanie…</span>
          ) : checkpoints.length === 0 ? (
            <span className="gf-model-empty">brak checkpointów w ComfyUI</span>
          ) : (
            <select
              value={selectedCheckpoint}
              onChange={(e) => setSelectedCheckpoint(e.target.value)}
              disabled={isGenerating}
            >
              {checkpoints.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </label>
      </div>

      <div className="gf-prompt-area">
        <textarea
          className="gf-prompt-input"
          placeholder="Opisz co chcesz zmienić, np. 'replace with a jumbo jet'"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && canGenerate) {
              e.preventDefault();
              if (hasResult) doRegenerate();
              else doGenerate();
            }
          }}
          rows={3}
          disabled={isGenerating}
        />
      </div>

      {isGenerating && (
        <div className="gf-loading">
          <div className="gf-spinner" />
          <span>Generowanie…</span>
        </div>
      )}

      <div className="gf-actions">
        {!hasResult && !isGenerating && (
          <button
            className="gf-btn gf-btn-primary"
            onClick={doGenerate}
            disabled={!canGenerate}
          >
            🚀 Generuj
          </button>
        )}

        {hasResult && !isGenerating && (
          <>
            <button className="gf-btn gf-btn-accept" onClick={onAccept}>
              ✓ Zatwierdź
            </button>
            <button
              className="gf-btn gf-btn-regen"
              onClick={doRegenerate}
              disabled={!canGenerate}
            >
              ↻ Przegeneruj
            </button>
            <button className="gf-btn gf-btn-cancel" onClick={onCancel}>
              ✕ Anuluj
            </button>
          </>
        )}

        {!hasResult && !isGenerating && (
          <button className="gf-btn gf-btn-cancel" onClick={onCancel}>
            Anuluj
          </button>
        )}
      </div>
    </div>
  );
}
