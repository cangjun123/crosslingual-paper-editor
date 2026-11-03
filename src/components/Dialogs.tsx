import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  ListRestart,
  LoaderCircle,
  Server,
  X,
} from "lucide-react";
import type { AppSettings, ConfigResponse } from "../../shared/contracts";
import {
  PROVIDERS,
  PROVIDER_LABELS,
  PROVIDER_URL_EXAMPLES,
  connectionSchema,
  tryResolveBaseUrl,
  usesCustomConnection,
} from "../../shared/providers";
import { useEscapeKey } from "../hooks/useEscapeKey";
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
  useEscapeKey(onClose);
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
  testResult?: TestResult;
  modelOptions: string[];
  loadingModels: boolean;
  onChange: (patch: Partial<AppSettings>) => void;
  onTest: () => void;
  onFetchModels: () => void;
  onClose: () => void;
};

export type TestResult = {
  ok: boolean;
  message: string;
};

export function SettingsDialog({
  settings,
  config,
  testing,
  testResult,
  modelOptions,
  loadingModels,
  onChange,
  onTest,
  onFetchModels,
  onClose,
}: SettingsDialogProps) {
  useEscapeKey(onClose);
  const [showKey, setShowKey] = useState(false);
  const custom = usesCustomConnection(settings);
  const serverReady = config.baseUrlConfigured && config.apiKeyConfigured;
  const connectionIssue = custom
    ? connectionSchema.safeParse(settings).error?.issues[0]?.message
    : undefined;
  const enteredUrl = settings.baseUrl.trim().replace(/\/+$/, "");
  const resolvedUrl = enteredUrl ? tryResolveBaseUrl(settings.provider, enteredUrl) : undefined;
  const connectionUsable = custom ? !connectionIssue : serverReady;

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
            <p>模型服务与生成参数，自动保存在当前浏览器中</p>
          </div>
          <IconButton label="关闭设置" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>

        <div className="settings-body">
          <section className="settings-section" aria-labelledby="provider-title">
            <h3 id="provider-title" className="section-title">模型服务</h3>

            <div className="field-group">
              <span id="provider-label">接口格式</span>
              <div className="provider-switch" role="radiogroup" aria-labelledby="provider-label">
                {PROVIDERS.map((provider) => (
                  <button
                    key={provider}
                    type="button"
                    role="radio"
                    aria-checked={settings.provider === provider}
                    onClick={() => onChange({ provider })}
                  >
                    {PROVIDER_LABELS[provider]}
                  </button>
                ))}
              </div>
            </div>

            <label className="field-group">
              <span>Base URL</span>
              <input
                type="text"
                value={settings.baseUrl}
                onChange={(event) => onChange({ baseUrl: event.target.value })}
                placeholder={PROVIDER_URL_EXAMPLES[settings.provider]}
                spellCheck={false}
                autoComplete="off"
                inputMode="url"
              />
              {resolvedUrl && resolvedUrl !== enteredUrl && (
                <small className="field-hint">
                  实际请求地址：<code>{resolvedUrl}</code>
                </small>
              )}
            </label>

            <div className="field-group">
              <label htmlFor="settings-api-key">API key</label>
              <span className="input-with-action">
                <input
                  id="settings-api-key"
                  type={showKey ? "text" : "password"}
                  value={settings.apiKey}
                  onChange={(event) => onChange({ apiKey: event.target.value })}
                  placeholder={serverReady ? "留空则使用服务器 .env 配置" : "sk-..."}
                  spellCheck={false}
                  autoComplete="off"
                />
                <IconButton
                  label={showKey ? "隐藏 API key" : "显示 API key"}
                  onClick={() => setShowKey((value) => !value)}
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </IconButton>
              </span>
              <small className="field-hint">仅保存在本浏览器中，请求时经本站后端转发给模型服务。</small>
            </div>

            {connectionIssue ? (
              <p className="connection-source missing">
                <AlertTriangle size={15} />
                {connectionIssue}
              </p>
            ) : (
              !custom && (
                <p className={`connection-source ${serverReady ? "ready" : "missing"}`}>
                  {serverReady ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                  {serverReady
                    ? `未填写时使用服务器 .env 配置（${PROVIDER_LABELS[config.provider]}）`
                    : "服务器未配置模型服务，请填写 Base URL 和 API key"}
                </p>
              )
            )}

            <div className="field-group">
              <label htmlFor="settings-model">模型</label>
              <span className="input-with-action">
                <input
                  id="settings-model"
                  type="text"
                  value={settings.model}
                  onChange={(event) => onChange({ model: event.target.value })}
                  placeholder="输入或从列表中选择模型名称"
                  list="model-options"
                  spellCheck={false}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="button secondary compact"
                  onClick={onFetchModels}
                  disabled={loadingModels || !connectionUsable}
                  title="从模型服务获取可用模型列表"
                >
                  {loadingModels ? <LoaderCircle className="spin" size={15} /> : <ListRestart size={15} />}
                  获取列表
                </button>
              </span>
              {modelOptions.length > 0 && (
                <small className="field-hint">共 {modelOptions.length} 个候选模型，可在输入框中选择或继续输入筛选</small>
              )}
            </div>

            {testResult && (
              <p className={`test-result ${testResult.ok ? "ok" : "failed"}`} role="status">
                {testResult.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                <span>{testResult.message}</span>
              </p>
            )}
            <button
              type="button"
              className="button secondary full-width"
              onClick={onTest}
              disabled={testing || !settings.model.trim() || !connectionUsable}
            >
              {testing ? <LoaderCircle className="spin" size={16} /> : <Server size={16} />}
              {testing ? "正在测试" : "测试连接"}
            </button>
          </section>

          <section className="settings-section" aria-labelledby="generation-title">
            <h3 id="generation-title" className="section-title">生成参数</h3>
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
              {settings.provider === "anthropic" && settings.temperature > 1 && (
                <small className="field-hint">Anthropic 接口最高支持 1，超出时按 1 发送。</small>
              )}
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
          </section>
        </div>
      </section>
    </div>
  );
}

