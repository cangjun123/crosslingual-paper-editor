import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Clipboard,
  Download,
  FileText,
  History as HistoryIcon,
  Languages,
  LoaderCircle,
  RotateCcw,
  Save,
  Settings2,
  Square,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import {
  DEFAULT_SETTINGS,
  createEmptyEditorState,
  createEmptyProject,
  normalizeEnglishSource,
  reviseRequestSchema,
  translateRequestSchema,
  type AppSettings,
  type ConfigResponse,
  type EditorState,
  type HistoryItem,
  type ParsedReviseRequest,
  type ProjectData,
} from "../shared/contracts";
import { ConfirmDialog, SettingsDialog, type Confirmation } from "./components/Dialogs";
import { DiffView } from "./components/DiffView";
import { HistoryDrawer } from "./components/HistoryDrawer";
import { IconButton } from "./components/IconButton";
import {
  ApiClientError,
  fetchConfig,
  reviseEnglish,
  testLlm,
  translateToChinese,
} from "./lib/api";
import { getChineseDiff, getEnglishDiff, serializeChineseDiff } from "./lib/diff";
import {
  PersistenceError,
  downloadProject,
  loadProject,
  loadSettings,
  parseProjectJson,
  saveProject,
  saveSettings,
} from "./lib/storage";

type GenerationState = {
  kind: "translation" | "revision";
  preview: string;
};

type Notice = {
  kind: "success" | "warning" | "error";
  message: string;
};

type SaveStatus = "saved" | "saving" | "error";

const DEFAULT_CONFIG: ConfigResponse = {
  defaultModel: DEFAULT_SETTINGS.model,
  baseUrlConfigured: false,
  apiKeyConfigured: false,
};

export default function App() {
  const [project, setProject] = useState<ProjectData>(() => createEmptyProject());
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [config, setConfig] = useState<ConfigResponse>(DEFAULT_CONFIG);
  const [hydrated, setHydrated] = useState(false);
  const [generation, setGeneration] = useState<GenerationState | null>(null);
  const [lastRevisionRequest, setLastRevisionRequest] = useState<ParsedReviseRequest | null>(null);
  const [revisionSignature, setRevisionSignature] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [chineseTab, setChineseTab] = useState<"edited" | "original">("edited");
  const [diffTab, setDiffTab] = useState<"chinese" | "english">("chinese");
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<string>();

  const abortRef = useRef<AbortController | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const projectRef = useRef(project);
  const settingsRef = useRef(settings);
  const current = project.current;
  const busy = generation !== null;

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;

    async function hydrate() {
      const storedProject = loadProject();
      const storedSettings = loadSettings();
      let remoteConfig = DEFAULT_CONFIG;
      let configWarning: string | undefined;

      try {
        remoteConfig = await fetchConfig(controller.signal);
      } catch (error) {
        if (!isAbortError(error)) {
          configWarning = "无法读取后端配置，请确认本地 API 服务已启动。";
        }
      }
      if (disposed) {
        return;
      }

      const initialSettings = storedSettings.value ?? {
        ...DEFAULT_SETTINGS,
        model: remoteConfig.defaultModel || DEFAULT_SETTINGS.model,
      };
      const initialProject = storedProject.value ?? createEmptyProject(initialSettings.model);
      const effectiveModel =
        initialProject.current.model.trim() ||
        initialSettings.model.trim() ||
        remoteConfig.defaultModel ||
        DEFAULT_SETTINGS.model;
      const normalizedSettings = { ...initialSettings, model: effectiveModel };
      const normalizedProject = {
        ...initialProject,
        current: { ...initialProject.current, model: effectiveModel },
      };

      setConfig(remoteConfig);
      setSettings(normalizedSettings);
      setProject(normalizedProject);
      setRevisionSignature(
        normalizedProject.current.revisedEnglish
          ? signatureForCurrent(normalizedProject.current, normalizedSettings)
          : null,
      );
      const warning = storedProject.error ?? storedSettings.error ?? configWarning;
      if (warning) {
        setNotice({ kind: "warning", message: warning });
      }
      setHydrated(true);
    }

    void hydrate();
    return () => {
      disposed = true;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    projectRef.current = project;
    settingsRef.current = settings;
  }, [project, settings]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    const statusTimer = window.setTimeout(() => setSaveStatus("saving"), 0);
    const timer = window.setTimeout(() => {
      try {
        saveProject(project);
        saveSettings(settings);
        setSaveStatus("saved");
      } catch (error) {
        setSaveStatus("error");
        showError(error, setNotice);
      }
    }, 500);
    return () => {
      window.clearTimeout(statusTimer);
      window.clearTimeout(timer);
    };
  }, [project, settings, hydrated]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    const flush = () => {
      try {
        saveProject(projectRef.current);
        saveSettings(settingsRef.current);
      } catch {
        // The active UI already reports quota errors from the debounced save.
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [hydrated]);

  useEffect(() => {
    if (notice?.kind !== "success") {
      return;
    }
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const chineseDiff = useMemo(
    () => getChineseDiff(current.originalChinese, current.editedChinese),
    [current.originalChinese, current.editedChinese],
  );
  const visibleRevisedEnglish =
    generation?.kind === "revision" ? generation.preview : current.revisedEnglish;
  const englishDiff = useMemo(
    () => getEnglishDiff(current.originalEnglish, visibleRevisedEnglish),
    [current.originalEnglish, visibleRevisedEnglish],
  );
  const currentRevisionRequest = useMemo(
    () => buildRevisionRequest(current, settings),
    [current, settings],
  );
  const currentRevisionSignature = currentRevisionRequest
    ? signatureForRequest(currentRevisionRequest)
    : null;
  const translationStale = Boolean(
    current.originalChinese &&
      current.translatedFromEnglish !== undefined &&
      current.translatedFromEnglish !== normalizeEnglishSource(current.originalEnglish),
  );
  const revisionStale = Boolean(
    current.revisedEnglish && revisionSignature && revisionSignature !== currentRevisionSignature,
  );
  const canRetry = Boolean(
    lastRevisionRequest &&
      currentRevisionSignature &&
      signatureForRequest(lastRevisionRequest) === currentRevisionSignature,
  );

  function updateCurrent<K extends keyof EditorState>(key: K, value: EditorState[K]) {
    setProject((previous) => ({
      ...previous,
      current: { ...previous.current, [key]: value },
    }));
  }

  function updateAppSettings(patch: Partial<AppSettings>) {
    setSettings((previous) => ({ ...previous, ...patch }));
    if (patch.model !== undefined) {
      updateCurrent("model", patch.model);
    }
    setTestResult(undefined);
  }

  function requestTranslation() {
    if (!current.originalEnglish.trim()) {
      setNotice({ kind: "error", message: "请先输入原英文段落。" });
      return;
    }
    const overwritesEdits =
      current.editedChinese.trim() &&
      (current.editedChinese !== current.originalChinese || Boolean(current.revisedEnglish));
    if (overwritesEdits) {
      setConfirmation({
        title: "重新生成中文译文？",
        message: "当前中文修改和英文结果会被自动备份，然后使用当前英文重新生成译文。",
        confirmLabel: "备份并重新生成",
        onConfirm: () => void runTranslation({ backupCurrent: true }),
      });
      return;
    }
    void runTranslation();
  }

  async function runTranslation(options: { backupCurrent?: boolean } = {}) {
    let request;
    try {
      request = translateRequestSchema.parse({
        originalEnglish: current.originalEnglish,
        model: settings.model,
        temperature: settings.temperature,
        stream: settings.stream,
      });
    } catch (error) {
      showError(error, setNotice);
      return;
    }

    if (options.backupCurrent && !saveAutomaticBackup()) {
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setGeneration({ kind: "translation", preview: "" });
    setNotice(null);
    try {
      const translated = await translateToChinese(
        request,
        (preview) =>
          setGeneration((state) =>
            state?.kind === "translation" ? { ...state, preview } : state,
          ),
        controller.signal,
      );
      setProject((previous) => ({
        ...previous,
        current: {
          ...previous.current,
          translatedFromEnglish: request.originalEnglish,
          originalChinese: translated,
          editedChinese: translated,
          revisedEnglish: "",
        },
      }));
      setRevisionSignature(null);
      setLastRevisionRequest(null);
      setChineseTab("edited");
      setNotice({
        kind: "success",
        message: options.backupCurrent
          ? "中文译文已生成；原内容已保存到历史版本。"
          : "中文译文已生成。",
      });
    } catch (error) {
      if (!isAbortError(error)) {
        showError(error, setNotice);
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setGeneration(null);
      }
    }
  }

  function requestRevision() {
    if (translationStale) {
      setConfirmation({
        title: "原英文已在翻译后发生变化",
        message: "当前中文修改仍然保留。可以恢复翻译时的英文后继续回写，或先自动备份再重新翻译当前英文。",
        confirmLabel: "备份并重新翻译",
        onConfirm: () => void runTranslation({ backupCurrent: true }),
        secondaryLabel: "恢复翻译时英文",
        onSecondary: restoreTranslatedEnglish,
      });
      return;
    }
    if (!currentRevisionRequest) {
      setNotice({ kind: "error", message: "请补全原英文、中文译文和模型名称。" });
      return;
    }
    void runRevision(currentRevisionRequest);
  }

  function restoreTranslatedEnglish() {
    const translatedFromEnglish = current.translatedFromEnglish;
    if (translatedFromEnglish === undefined) {
      setNotice({ kind: "error", message: "无法确定生成当前中文译文时使用的英文。" });
      return;
    }

    const backup = createHistoryItem(current, settings, "automatic");
    const next = {
      ...project,
      current: { ...current, originalEnglish: translatedFromEnglish },
      history: [backup, ...project.history],
    };
    if (commitProject(next, setProject, setNotice)) {
      setNotice({ kind: "success", message: "已恢复翻译时英文；刚才的内容已自动备份。" });
    }
  }

  function saveAutomaticBackup(): boolean {
    const backup = createHistoryItem(current, settings, "automatic");
    const next = { ...project, history: [backup, ...project.history] };
    return commitProject(next, setProject, setNotice);
  }

  async function runRevision(request: ParsedReviseRequest) {
    const controller = new AbortController();
    abortRef.current = controller;
    setLastRevisionRequest(request);
    setGeneration({ kind: "revision", preview: "" });
    setNotice(null);
    try {
      const revised = await reviseEnglish(
        request,
        (preview) =>
          setGeneration((state) =>
            state?.kind === "revision" ? { ...state, preview } : state,
          ),
        controller.signal,
      );
      setProject((previous) => ({
        ...previous,
        current: { ...previous.current, revisedEnglish: revised },
      }));
      setRevisionSignature(signatureForRequest(request));
      setDiffTab("english");
      setNotice({ kind: "success", message: "英文段落已生成。" });
    } catch (error) {
      if (!isAbortError(error)) {
        showError(error, setNotice);
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setGeneration(null);
      }
    }
  }

  function stopGeneration() {
    abortRef.current?.abort();
    abortRef.current = null;
    setGeneration(null);
    setNotice({ kind: "warning", message: "生成已停止，之前的结果未被覆盖。" });
  }

  async function copyRevisedEnglish() {
    if (!current.revisedEnglish) {
      return;
    }
    try {
      await copyText(current.revisedEnglish);
      setNotice({ kind: "success", message: "英文结果已复制。" });
    } catch {
      setNotice({ kind: "error", message: "复制失败，请手动选择结果文本。" });
    }
  }

  function saveCurrentVersion() {
    if (!current.originalEnglish.trim()) {
      setNotice({ kind: "error", message: "至少需要原英文内容才能保存版本。" });
      return;
    }
    const item = createHistoryItem(current, settings, "manual");
    const next = { ...project, history: [item, ...project.history] };
    if (commitProject(next, setProject, setNotice)) {
      setNotice({ kind: "success", message: "当前版本已保存。" });
    }
  }

  function requestClear() {
    if (!editorHasContent(current)) {
      clearCurrent();
      return;
    }
    setConfirmation({
      title: "清空当前任务？",
      message: "当前编辑内容会被清除，已保存的历史版本不受影响。",
      confirmLabel: "清空",
      destructive: true,
      onConfirm: clearCurrent,
    });
  }

  function clearCurrent() {
    abortRef.current?.abort();
    const next = {
      ...project,
      current: createEmptyEditorState(settings.model.trim() || config.defaultModel),
    };
    if (commitProject(next, setProject, setNotice)) {
      setGeneration(null);
      setRevisionSignature(null);
      setLastRevisionRequest(null);
      setNotice({ kind: "success", message: "当前任务已清空。" });
    }
  }

  function requestRestore(item: HistoryItem) {
    setConfirmation({
      title: "恢复此历史版本？",
      message: "历史版本将替换当前编辑区，历史列表本身不会改变。",
      confirmLabel: "恢复",
      onConfirm: () => restoreHistory(item),
    });
  }

  function restoreHistory(item: HistoryItem) {
    const model = item.model.trim() || settings.model || config.defaultModel;
    const restored: EditorState = {
      originalEnglish: item.originalEnglish,
      translatedFromEnglish: item.translatedFromEnglish,
      fullPaperContext: item.fullPaperContext ?? "",
      originalChinese: item.originalChinese,
      editedChinese: item.editedChinese,
      extraInstruction: item.extraInstruction ?? "",
      revisedEnglish: item.revisedEnglish,
      model,
    };
    const next = { ...project, current: restored };
    if (commitProject(next, setProject, setNotice)) {
      const nextSettings = { ...settings, model };
      setSettings(nextSettings);
      setRevisionSignature(restored.revisedEnglish ? signatureForCurrent(restored, nextSettings) : null);
      setLastRevisionRequest(null);
      setHistoryOpen(false);
      setNotice({ kind: "success", message: "历史版本已恢复。" });
    }
  }

  function requestDelete(item: HistoryItem) {
    setConfirmation({
      title: "删除此历史版本？",
      message: "删除后只能通过先前导出的 JSON 找回。",
      confirmLabel: "删除",
      destructive: true,
      onConfirm: () => {
        const next = { ...project, history: project.history.filter((entry) => entry.id !== item.id) };
        if (commitProject(next, setProject, setNotice)) {
          setNotice({ kind: "success", message: "历史版本已删除。" });
        }
      },
    });
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      const imported = parseProjectJson(await file.text());
      const applyImport = () => {
        const model = imported.current.model.trim() || settings.model || config.defaultModel;
        const normalized = {
          ...imported,
          current: { ...imported.current, model },
        };
        if (commitProject(normalized, setProject, setNotice)) {
          const nextSettings = { ...settings, model };
          setSettings(nextSettings);
          setRevisionSignature(
            normalized.current.revisedEnglish
              ? signatureForCurrent(normalized.current, nextSettings)
              : null,
          );
          setLastRevisionRequest(null);
          setNotice({ kind: "success", message: "JSON 项目已导入。" });
        }
      };
      if (editorHasContent(current) || project.history.length > 0) {
        setConfirmation({
          title: "导入并替换当前项目？",
          message: "导入文件会替换当前编辑内容和全部历史记录。",
          confirmLabel: "导入",
          onConfirm: applyImport,
        });
      } else {
        applyImport();
      }
    } catch (error) {
      showError(error, setNotice);
    }
  }

  async function testConnection() {
    if (!settings.model.trim()) {
      setNotice({ kind: "error", message: "请输入模型名称。" });
      return;
    }
    setTestingConnection(true);
    setTestResult(undefined);
    try {
      const result = await testLlm({
        model: settings.model.trim(),
        temperature: settings.temperature,
      });
      setTestResult(`连接成功 · ${result.latencyMs} ms`);
    } catch (error) {
      const message = errorMessage(error);
      setTestResult(message);
      setNotice({ kind: "error", message });
    } finally {
      setTestingConnection(false);
    }
  }

  if (!hydrated) {
    return (
      <div className="loading-screen">
        <Languages size={28} />
        <span>Cross-Lingual Paper Editor</span>
        <LoaderCircle className="spin" size={18} />
      </div>
    );
  }

  const chineseText =
    generation?.kind === "translation"
      ? generation.preview
      : chineseTab === "edited"
        ? current.editedChinese
        : current.originalChinese;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand" aria-label="Cross-Lingual Paper Editor">
          <div className="brand-mark"><Languages size={19} /></div>
          <div>
            <strong>Cross-Lingual</strong>
            <span>Paper Editor</span>
          </div>
        </div>

        <label className="model-control">
          <span>模型</span>
          <input
            type="text"
            value={settings.model}
            onChange={(event) => updateAppSettings({ model: event.target.value })}
            disabled={busy}
            aria-invalid={!settings.model.trim()}
          />
        </label>

        <div className="header-actions">
          <span className={`save-status ${saveStatus}`}>
            {saveStatus === "saving" ? <LoaderCircle className="spin" size={14} /> : saveStatus === "saved" ? <Check size={14} /> : <AlertCircle size={14} />}
            {saveStatus === "saving" ? "保存中" : saveStatus === "saved" ? "已保存" : "未保存"}
          </span>
          <IconButton label="导入 JSON" onClick={() => importInputRef.current?.click()} disabled={busy}>
            <Upload size={18} />
          </IconButton>
          <IconButton label="导出 JSON" onClick={() => downloadProject(project)}>
            <Download size={18} />
          </IconButton>
          <IconButton label="历史版本" onClick={() => setHistoryOpen(true)}>
            <HistoryIcon size={18} />
            {project.history.length > 0 && <span className="icon-count">{project.history.length}</span>}
          </IconButton>
          <IconButton label="设置" onClick={() => setSettingsOpen(true)} disabled={busy}>
            <Settings2 size={18} />
          </IconButton>
          <IconButton label="清空当前任务" className="danger-icon" onClick={requestClear} disabled={busy}>
            <Trash2 size={18} />
          </IconButton>
          <input
            ref={importInputRef}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={handleImport}
            tabIndex={-1}
          />
        </div>
      </header>

      <main className="workspace">
        {notice && (
          <div className={`notice ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
            <AlertCircle size={17} />
            <span>{notice.message}</span>
            <IconButton label="关闭提示" onClick={() => setNotice(null)}><X size={15} /></IconButton>
          </div>
        )}

        <section className="editor-grid" aria-label="段落编辑区">
          <article className="editor-panel">
            <header className="panel-header">
              <div><span className="panel-index">01</span><h1>原英文段落</h1></div>
              <span className="char-count">{current.originalEnglish.length.toLocaleString()} 字符</span>
            </header>
            <textarea
              className="editor-textarea"
              value={current.originalEnglish}
              onChange={(event) => updateCurrent("originalEnglish", event.target.value)}
              placeholder="Paste the English academic paragraph here..."
              spellCheck="true"
              readOnly={busy}
              aria-label="原英文段落"
            />
            <footer className="panel-footer">
              {generation?.kind === "translation" ? (
                <button type="button" className="button danger" onClick={stopGeneration}>
                  <Square size={15} fill="currentColor" />停止
                </button>
              ) : (
                <button
                  type="button"
                  className="button primary"
                  onClick={requestTranslation}
                  disabled={busy || !current.originalEnglish.trim() || !settings.model.trim()}
                >
                  <Languages size={17} />生成中文译文
                </button>
              )}
            </footer>
          </article>

          <article className="editor-panel chinese-panel">
            <header className="panel-header tabbed-header">
              <div><span className="panel-index">02</span><h1>中文语义编辑</h1></div>
              {translationStale && (
                <span className="stale-badge" title="点击回写按钮选择恢复英文或重新翻译">
                  原英文已变更
                </span>
              )}
            </header>
            <div className="view-tabs" role="tablist" aria-label="中文视图">
              <button type="button" role="tab" aria-selected={chineseTab === "edited"} onClick={() => setChineseTab("edited")}>编辑</button>
              <button type="button" role="tab" aria-selected={chineseTab === "original"} onClick={() => setChineseTab("original")}>原译</button>
              <span className="tab-count">{(chineseTab === "edited" ? current.editedChinese : current.originalChinese).length.toLocaleString()} 字符</span>
            </div>
            <textarea
              className="editor-textarea"
              value={chineseText}
              onChange={(event) => updateCurrent("editedChinese", event.target.value)}
              placeholder={generation?.kind === "translation" ? "正在生成..." : "中文译文将在这里显示"}
              readOnly={busy || chineseTab === "original"}
              aria-label={chineseTab === "edited" ? "编辑后的中文" : "原始中文译文"}
            />
            <footer className="panel-footer">
              {generation?.kind === "revision" ? (
                <button type="button" className="button danger" onClick={stopGeneration}>
                  <Square size={15} fill="currentColor" />停止
                </button>
              ) : (
                <button
                  type="button"
                  className="button primary"
                  onClick={requestRevision}
                  disabled={busy || !currentRevisionRequest}
                >
                  <WandSparkles size={17} />根据中文回写英文
                </button>
              )}
            </footer>
          </article>

          <article className="editor-panel result-panel">
            <header className="panel-header">
              <div><span className="panel-index">03</span><h1>修改后英文</h1></div>
              {revisionStale && <span className="stale-badge">输入已变更</span>}
            </header>
            <textarea
              className="editor-textarea result-textarea"
              value={visibleRevisedEnglish}
              placeholder={generation?.kind === "revision" ? "正在生成..." : "Revised English will appear here..."}
              readOnly
              aria-label="修改后的英文"
            />
            <footer className="panel-footer result-actions">
              <button
                type="button"
                className="button secondary compact"
                onClick={() => lastRevisionRequest && void runRevision(lastRevisionRequest)}
                disabled={busy || !canRetry}
                title={lastRevisionRequest && !canRetry ? "输入已变化，请使用当前输入重新生成" : "使用上次相同输入重新生成"}
              >
                <RotateCcw size={16} />重试
              </button>
              <IconButton label="复制英文结果" onClick={copyRevisedEnglish} disabled={!current.revisedEnglish || busy}>
                <Clipboard size={17} />
              </IconButton>
              <button
                type="button"
                className="button secondary compact"
                onClick={saveCurrentVersion}
                disabled={busy || !current.originalEnglish.trim() || !settings.model.trim()}
              >
                <Save size={16} />保存版本
              </button>
            </footer>
          </article>
        </section>

        <section className="support-band">
          <details className="context-section">
            <summary>
              <span><FileText size={17} />全文上下文</span>
              <span className="summary-meta">{current.fullPaperContext?.length.toLocaleString() ?? 0} 字符 <ChevronDown size={16} /></span>
            </summary>
            <textarea
              value={current.fullPaperContext ?? ""}
              onChange={(event) => updateCurrent("fullPaperContext", event.target.value)}
              placeholder="粘贴可选的全文 LaTeX 上下文"
              readOnly={busy}
              aria-label="全文上下文"
            />
          </details>
          <div className="instruction-section">
            <label htmlFor="extra-instruction">额外修改要求</label>
            <textarea
              id="extra-instruction"
              value={current.extraInstruction ?? ""}
              onChange={(event) => updateCurrent("extraInstruction", event.target.value)}
              placeholder="例如：弱化第二句话的结论，保持 technical writing 风格。"
              readOnly={busy}
            />
          </div>
        </section>

        <section className="diff-section" aria-labelledby="diff-heading">
          <header className="diff-header">
            <div>
              <h2 id="diff-heading">修改对比</h2>
              <div className="diff-legend" aria-label="对比图例"><span className="removed">删除</span><span className="added">新增</span></div>
            </div>
            <div className="segmented-control" role="tablist" aria-label="对比语言">
              <button type="button" role="tab" aria-selected={diffTab === "chinese"} onClick={() => setDiffTab("chinese")}>中文</button>
              <button type="button" role="tab" aria-selected={diffTab === "english"} onClick={() => setDiffTab("english")}>英文</button>
            </div>
          </header>
          {diffTab === "chinese" ? (
            <DiffView parts={chineseDiff} empty={!current.originalChinese} label="中文修改对比" />
          ) : (
            <DiffView parts={englishDiff} empty={!visibleRevisedEnglish} label="英文修改对比" />
          )}
        </section>
      </main>

      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          config={config}
          testing={testingConnection}
          testResult={testResult}
          onChange={updateAppSettings}
          onTest={() => void testConnection()}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {historyOpen && (
        <HistoryDrawer
          history={project.history}
          onRestore={requestRestore}
          onDelete={requestDelete}
          onClose={() => setHistoryOpen(false)}
        />
      )}
      {confirmation && <ConfirmDialog confirmation={confirmation} onClose={() => setConfirmation(null)} />}
    </div>
  );
}

function createHistoryItem(
  current: EditorState,
  settings: AppSettings,
  saveKind: NonNullable<HistoryItem["saveKind"]>,
): HistoryItem {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    model: settings.model.trim(),
    saveKind,
    originalEnglish: current.originalEnglish,
    translatedFromEnglish: current.translatedFromEnglish,
    fullPaperContext: current.fullPaperContext,
    originalChinese: current.originalChinese,
    editedChinese: current.editedChinese,
    chineseDiff: serializeChineseDiff(current.originalChinese, current.editedChinese),
    extraInstruction: current.extraInstruction,
    revisedEnglish: current.revisedEnglish,
  };
}

function buildRevisionRequest(current: EditorState, settings: AppSettings): ParsedReviseRequest | null {
  const parsed = reviseRequestSchema.safeParse({
    originalEnglish: current.originalEnglish,
    fullPaperContext: current.fullPaperContext,
    originalChinese: current.originalChinese,
    editedChinese: current.editedChinese,
    chineseDiff: serializeChineseDiff(current.originalChinese, current.editedChinese),
    extraInstruction: current.extraInstruction,
    model: settings.model,
    temperature: settings.temperature,
    stream: settings.stream,
  });
  return parsed.success ? parsed.data : null;
}

function signatureForCurrent(current: EditorState, settings: AppSettings): string | null {
  const request = buildRevisionRequest(current, settings);
  return request ? signatureForRequest(request) : null;
}

function signatureForRequest(request: ParsedReviseRequest): string {
  return JSON.stringify(request);
}

function editorHasContent(current: EditorState): boolean {
  return [
    current.originalEnglish,
    current.fullPaperContext,
    current.originalChinese,
    current.editedChinese,
    current.extraInstruction,
    current.revisedEnglish,
  ].some((value) => Boolean(value?.trim()));
}

function commitProject(
  project: ProjectData,
  setProject: (project: ProjectData) => void,
  setNotice: (notice: Notice) => void,
): boolean {
  try {
    saveProject(project);
    setProject(project);
    return true;
  } catch (error) {
    showError(error, setNotice);
    return false;
  }
}

function showError(error: unknown, setNotice: (notice: Notice) => void): void {
  setNotice({ kind: "error", message: errorMessage(error) });
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError || error instanceof PersistenceError) {
    return error.message;
  }
  if (error && typeof error === "object" && "issues" in error) {
    const issues = (error as { issues?: Array<{ message?: string }> }).issues;
    return issues?.[0]?.message ?? "输入内容无效。";
  }
  return error instanceof Error ? error.message : "操作失败，请重试。";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) {
    throw new Error("Copy failed");
  }
}
