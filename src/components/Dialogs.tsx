import { AlertTriangle, CheckCircle2, LoaderCircle, Server, X } from "lucide-react";
import type { AppSettings, ConfigResponse } from "../../shared/contracts";
import { IconButton } from "./IconButton";

export type Confirmation = {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
};

type ConfirmDialogProps = {
  confirmation: Confirmation;
  onClose: () => void;
};

export function ConfirmDialog({ confirmation, onClose }: ConfirmDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="confirm-icon" aria-hidden="true">
          <AlertTriangle size={20} />
        </div>
        <div>
          <h2 id="confirm-title">{confirmation.title}</h2>
          <p>{confirmation.message}</p>
        </div>
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose} autoFocus>
            取消
          </button>
          {confirmation.secondaryLabel && confirmation.onSecondary && (
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                onClose();
                confirmation.onSecondary?.();
              }}
            >
              {confirmation.secondaryLabel}
            </button>
          )}
          <button
            type="button"
            className={`button ${confirmation.destructive ? "danger" : "primary"}`}
            onClick={() => {
              onClose();
              confirmation.onConfirm();
            }}
          >
            {confirmation.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

type SettingsDialogProps = {
  settings: AppSettings;
  config: ConfigResponse;
  testing: boolean;
  testResult?: string;
  onChange: (patch: Partial<AppSettings>) => void;
  onTest: () => void;
  onClose: () => void;
};

export function SettingsDialog({
  settings,
  config,
  testing,
  testResult,
  onChange,
  onTest,
  onClose,
}: SettingsDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog-header">
          <div>
            <h2 id="settings-title">设置</h2>
            <p>生成参数与后端连接状态</p>
          </div>
          <IconButton label="关闭设置" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>

        <div className="settings-body">
          <label className="field-group">
            <span>模型</span>
            <input
              type="text"
              value={settings.model}
              onChange={(event) => onChange({ model: event.target.value })}
              placeholder="输入兼容端点支持的模型名称"
              autoFocus
            />
          </label>

          <div className="field-group">
            <div className="field-heading">
              <label htmlFor="temperature-range">Temperature</label>
              <input
                className="number-input"
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={settings.temperature}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value)) {
                    onChange({ temperature: Math.min(2, Math.max(0, value)) });
                  }
                }}
                aria-label="Temperature 数值"
              />
            </div>
            <input
              id="temperature-range"
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={settings.temperature}
              onChange={(event) => onChange({ temperature: Number(event.target.value) })}
            />
          </div>

          <label className="toggle-row">
            <span>
              <strong>流式输出</strong>
              <small>逐步显示模型生成内容</small>
            </span>
            <input
              type="checkbox"
              checked={settings.stream}
              onChange={(event) => onChange({ stream: event.target.checked })}
            />
            <span className="toggle" aria-hidden="true" />
          </label>

          <section className="connection-panel" aria-labelledby="connection-title">
            <div className="connection-heading">
              <Server size={18} />
              <h3 id="connection-title">后端配置</h3>
            </div>
            <ConfigStatus label="Base URL" configured={config.baseUrlConfigured} />
            <ConfigStatus label="API key" configured={config.apiKeyConfigured} />
            {testResult && <p className="test-result" role="status">{testResult}</p>}
            <button
              type="button"
              className="button secondary full-width"
              onClick={onTest}
              disabled={testing || !settings.model.trim()}
            >
              {testing ? <LoaderCircle className="spin" size={16} /> : <Server size={16} />}
              {testing ? "正在测试" : "测试连接"}
            </button>
          </section>
        </div>
      </section>
    </div>
  );
}

function ConfigStatus({ label, configured }: { label: string; configured: boolean }) {
  return (
    <div className="config-status">
      <span>{label}</span>
      <span className={configured ? "configured" : "missing"}>
        {configured ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
        {configured ? "已配置" : "未配置"}
      </span>
    </div>
  );
}
