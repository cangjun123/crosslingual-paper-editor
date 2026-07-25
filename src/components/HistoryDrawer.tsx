import { Clock3, RotateCcw, Trash2, X } from "lucide-react";
import type { HistoryItem } from "../../shared/contracts";
import { IconButton } from "./IconButton";

type HistoryDrawerProps = {
  history: HistoryItem[];
  onRestore: (item: HistoryItem) => void;
  onDelete: (item: HistoryItem) => void;
  onClose: () => void;
};

export function HistoryDrawer({ history, onRestore, onDelete, onClose }: HistoryDrawerProps) {
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        className="history-drawer"
        aria-labelledby="history-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="drawer-header">
          <div>
            <h2 id="history-title">历史版本</h2>
            <p>{history.length} 条已保存记录</p>
          </div>
          <IconButton label="关闭历史记录" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>

        <div className="history-list">
          {history.length === 0 ? (
            <div className="history-empty">
              <Clock3 size={24} />
              <p>尚未保存版本</p>
            </div>
          ) : (
            history.map((item) => (
              <article className="history-item" key={item.id}>
                <div className="history-meta">
                  <time dateTime={item.createdAt}>{formatHistoryTime(item.createdAt)}</time>
                  <span>{item.model || "未指定模型"}</span>
                </div>
                <p>{snippet(item.revisedEnglish || item.originalEnglish)}</p>
                <div className="history-actions">
                  <button type="button" className="text-button" onClick={() => onRestore(item)}>
                    <RotateCcw size={15} />
                    恢复
                  </button>
                  <IconButton label="删除此版本" className="danger-icon" onClick={() => onDelete(item)}>
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              </article>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}

function formatHistoryTime(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function snippet(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 120 ? `${compact.slice(0, 120)}...` : compact || "空白版本";
}
