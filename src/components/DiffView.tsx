import type { DiffPart } from "../lib/diff";
import { hasChanges } from "../lib/diff";

type DiffViewProps = {
  parts: DiffPart[];
  empty: boolean;
  label: string;
};

export function DiffView({ parts, empty, label }: DiffViewProps) {
  if (empty) {
    return <div className="diff-empty">暂无可比较内容</div>;
  }

  return (
    <div className="diff-content" aria-label={label}>
      {!hasChanges(parts) && <span className="diff-no-change">内容未修改</span>}
      {parts.map((part, index) => {
        const key = `${index}-${part.type}`;
        if (part.type === "add") {
          return <ins key={key}>{part.value}</ins>;
        }
        if (part.type === "remove") {
          return <del key={key}>{part.value}</del>;
        }
        return <span key={key}>{part.value}</span>;
      })}
    </div>
  );
}
