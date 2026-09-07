import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import {
  ActiveModelInfo,
  AppSettings,
  ChatMessage,
  DriveStorageInfo,
  HardwareInfo,
  InferenceState,
  ModelLibrary,
  ModelRecord,
  ModelScanProgress,
  NavigationPage,
  Project,
  WorkspaceTab,
  AgentActivityItem,
  AgentPlanState,
  CheckpointDiffResult,
  CheckpointSummary,
  EditAgentState,
  PermissionLevel,
  RollbackResult,
} from '@shared/types';

import { DEFAULT_SETTINGS } from '@shared/constants';

export interface ToastItem {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
}

interface AppStoreContextType {
  currentPage: NavigationPage;
  setCurrentPage: (page: NavigationPage) => void;
  activeTab: WorkspaceTab;
  setActiveTab: (tab: WorkspaceTab) => void;
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
  projects: Project[];
  activeProject: Project | null;
  setActiveProjectId: (id: string | null) => void;
  addProject: () => Promise<Project | null>;
  removeProject: (id: string) => Promise<void>;

  // Permission Model (Pass 5)
  permissionLevel: PermissionLevel;
  setPermissionLevel: (level: PermissionLevel) => void;
  isEditPermissionModalOpen: boolean;
  setEditPermissionModalOpen: (open: boolean) => void;
  confirmEnableEdit: () => void;

  // Models & Libraries
  models: ModelRecord[];
  modelLibraries: ModelLibrary[];
  primaryDriveStorage: DriveStorageInfo | null;
  selectedModelId: string | null;
  setSelectedModelId: (id: string | null) => void;
  selectedModel: ModelRecord | null;
  isScanning: boolean;
  scanProgress: ModelScanProgress | null;
  addModelLibrary: (dirPath?: string) => Promise<string | null>;
  removeModelLibrary: (dirPath: string) => Promise<boolean>;
  scanModelLibrary: (dirPath: string) => Promise<void>;
  scanAllModelLibraries: () => Promise<void>;
  refreshModelsAndLibraries: () => Promise<void>;

  // Local Inference & Streaming Chat (Pass 3)
  inferenceState: InferenceState | null;
  activeModel: ActiveModelInfo | null;
  chatMessages: ChatMessage[];
  isGenerating: boolean;
  loadModel: (modelId: string, contextSize?: number) => Promise<ActiveModelInfo | null>;
  unloadModel: () => Promise<boolean>;
  sendChatMessage: (prompt: string) => Promise<void>;
  stopGeneration: () => Promise<boolean>;
  clearChat: () => Promise<boolean>;

  // Plan Agent & Workspace Intelligence (Pass 4)
  agentActivities: AgentActivityItem[];
  agentPlanState: AgentPlanState | null;
  isPlanning: boolean;
  activeRunId: string | null;
  runPlanAgent: (prompt: string) => Promise<void>;
  stopPlanAgent: () => Promise<boolean>;
  clearAgentActivities: () => void;

  // Edit Agent & Checkpoints (Pass 5)
  isEditing: boolean;
  editAgentState: EditAgentState | null;
  pendingCheckpoint: CheckpointSummary | null;
  checkpointDiff: CheckpointDiffResult | null;
  runEditAgent: (prompt: string) => Promise<void>;
  stopEditAgent: () => Promise<boolean>;
  acceptCheckpoint: () => Promise<void>;
  rollbackCheckpoint: () => Promise<RollbackResult | null>;
  createManualCheckpoint: (description?: string) => Promise<CheckpointSummary | null>;
  refreshPendingCheckpointAndDiff: () => Promise<void>;
  dismissRecoveryBanner: () => void;
  isRecoveryBannerDismissed: boolean;
  fileTreeRefreshCounter: number;

  hardwareInfo: HardwareInfo | null;
  toasts: ToastItem[];
  addToast: (message: string, type?: ToastItem['type']) => void;
  removeToast: (id: string) => void;
  isCommandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  isMaximized: boolean;
}


const AppStoreContext = createContext<AppStoreContextType | null>(null);

export const AppStoreProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentPage, setCurrentPage] = useState<NavigationPage>('builder');
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('diff');
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [hardwareInfo, setHardwareInfo] = useState<HardwareInfo | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  // Models State
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [modelLibraries, setModelLibraries] = useState<ModelLibrary[]>([]);
  const [primaryDriveStorage, setPrimaryDriveStorage] = useState<DriveStorageInfo | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<ModelScanProgress | null>(null);

  // Local Inference & Streaming Chat (Pass 3)
  const [inferenceState, setInferenceState] = useState<InferenceState | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  // Plan Agent & Workspace Intelligence (Pass 4)
  const [agentActivities, setAgentActivities] = useState<AgentActivityItem[]>([]);
  const [agentPlanState, setAgentPlanState] = useState<AgentPlanState | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  activeRunIdRef.current = activeRunId;

  // Permission & Edit Agent (Pass 5)
  const [permissionLevel, setPermissionLevel] = useState<PermissionLevel>('READ');
  const [isEditPermissionModalOpen, setEditPermissionModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editAgentState, setEditAgentState] = useState<EditAgentState | null>(null);
  const [pendingCheckpoint, setPendingCheckpoint] = useState<CheckpointSummary | null>(null);
  const [checkpointDiff, setCheckpointDiff] = useState<CheckpointDiffResult | null>(null);
  const [isRecoveryBannerDismissed, setIsRecoveryBannerDismissed] = useState(false);
  const [fileTreeRefreshCounter, setFileTreeRefreshCounter] = useState(0);


  const addToast = useCallback((message: string, type: ToastItem['type'] = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshModelsAndLibraries = useCallback(async () => {
    if (typeof window !== 'undefined' && window.modelForge) {
      try {
        const [loadedModels, loadedLibs, loadedStorage] = await Promise.all([
          window.modelForge.getModels(),
          window.modelForge.getModelLibraries(),
          window.modelForge.getPrimaryDriveStorage(),
        ]);
        setModels(loadedModels || []);
        setModelLibraries(loadedLibs || []);
        setPrimaryDriveStorage(loadedStorage);
      } catch (err) {
        console.error('Failed to refresh models and libraries:', err);
      }
    }
  }, []);

  // Initialize from electron bridge
  useEffect(() => {
    if (typeof window === 'undefined' || !window.modelForge) {
      console.error('[ModelForge] FATAL: window.modelForge is undefined in renderer.');
      addToast('Desktop integration unavailable. Please restart Model Forge.', 'error');
      return;
    }

    if (window.modelForge.getBridgeInfo) {
      const info = window.modelForge.getBridgeInfo();
      console.info(`[ModelForge] Bridge health verified: v${info.version} (format: ${info.preloadFormat}, platform: ${info.platform})`);
    }

    if (window.modelForge) {
      window.modelForge
        .getSettings()
        .then((loadedSettings) => {
          if (loadedSettings) {
            setSettings(loadedSettings);
            if (loadedSettings.startupPage) {
              setCurrentPage(loadedSettings.startupPage);
            }
            if (loadedSettings.compactMode) {
              document.body.classList.add('compact-mode');
            }
          }
        })
        .catch(console.error);

      window.modelForge
        .getProjects()
        .then((loadedProjects) => {
          if (loadedProjects && loadedProjects.length > 0) {
            setProjects(loadedProjects);
            setActiveProjectId(loadedProjects[0].id);
          }
        })
        .catch(console.error);

      window.modelForge
        .getHardwareInfo()
        .then((info) => {
          setHardwareInfo(info);
        })
        .catch(console.error);

      window.modelForge
        .getInferenceState()
        .then((state) => {
          if (state) setInferenceState(state);
        })
        .catch(console.error);

      window.modelForge.isMaximized().then(setIsMaximized).catch(console.error);

      refreshModelsAndLibraries();

      const unsubscribeState = window.modelForge.onWindowStateChange((max) => {
        setIsMaximized(max);
      });

      const unsubscribeInferenceState = window.modelForge.onInferenceStateChange((state) => {
        setInferenceState(state);
      });

      const unsubscribeInferenceChunk = window.modelForge.onInferenceChunk((chunk) => {
        setChatMessages((prev) => {
          const lastIndex = prev.length - 1;
          if (lastIndex < 0) return prev;
          const lastMsg = prev[lastIndex];

          if (lastMsg.role === 'assistant' && lastMsg.isStreaming) {
            const updated = [...prev];
            const updatedContent = lastMsg.content + (chunk.text || '');
            updated[lastIndex] = {
              ...lastMsg,
              content: updatedContent,
              isStreaming: !chunk.isDone,
              metrics: chunk.metrics || lastMsg.metrics,
            };
            return updated;
          }
          return prev;
        });
      });

      let unsubscribeScan: (() => void) | undefined;
      if (window.modelForge.onScanProgress) {
        unsubscribeScan = window.modelForge.onScanProgress((progress) => {
          setScanProgress(progress);
          if (progress.phase === 'started' || progress.phase === 'discovering' || progress.phase === 'inspecting') {
            setIsScanning(true);
          } else {
            setIsScanning(false);
            refreshModelsAndLibraries();
          }
        });
      }

      let unsubscribeAgentActivity: (() => void) | undefined;
      if (window.modelForge.onAgentActivity) {
        unsubscribeAgentActivity = window.modelForge.onAgentActivity((activity) => {
          if (activity.runId && activeRunIdRef.current && activity.runId !== activeRunIdRef.current) {
            // Drop stale events from non-active run
            return;
          }
          setAgentActivities((prev) => {
            const idx = prev.findIndex((a) => a.id === activity.id);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = activity;
              return updated;
            }
            return [...prev, activity];
          });
        });
      }

      let unsubscribeAgentState: (() => void) | undefined;
      if (window.modelForge.onAgentStateChange) {
        unsubscribeAgentState = window.modelForge.onAgentStateChange((state) => {
          if (state.runId && activeRunIdRef.current && state.runId !== activeRunIdRef.current) {
            // Drop stale state updates
            return;
          }
          setAgentPlanState(state);
          setIsPlanning(state.status === 'running');
        });
      }

      let unsubscribeEditActivity: (() => void) | undefined;
      if (window.modelForge.onEditAgentActivity) {
        unsubscribeEditActivity = window.modelForge.onEditAgentActivity((activity) => {
          if (activity.runId && activeRunIdRef.current && activity.runId !== activeRunIdRef.current) {
            return;
          }
          setAgentActivities((prev) => {
            const idx = prev.findIndex((a) => a.id === activity.id);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = activity;
              return updated;
            }
            return [...prev, activity];
          });
        });
      }

      let unsubscribeEditChunk: (() => void) | undefined;
      if (window.modelForge.onEditAgentChunk) {
        unsubscribeEditChunk = window.modelForge.onEditAgentChunk((chunk) => {
          if (chunk.runId && activeRunIdRef.current && chunk.runId !== activeRunIdRef.current) {
            return;
          }
          setChatMessages((prev) => {
            const updated = [...prev];
            const lastIndex = updated.length - 1;
            if (lastIndex >= 0 && updated[lastIndex].role === 'assistant') {
              const current = updated[lastIndex];
              updated[lastIndex] = {
                ...current,
                content: current.content + chunk.text,
                isStreaming: !chunk.isDone,
              };
            }
            return updated;
          });
          if (chunk.isDone) {
            setIsEditing(false);
            setFileTreeRefreshCounter((c) => c + 1);
          }
        });
      }

      let unsubscribeEditState: (() => void) | undefined;
      if (window.modelForge.onEditAgentStateChange) {
        unsubscribeEditState = window.modelForge.onEditAgentStateChange((state) => {
          if (state.runId && activeRunIdRef.current && state.runId !== activeRunIdRef.current) {
            return;
          }
          setEditAgentState(state);
          setIsEditing(state.status === 'running');
          if (state.status !== 'running') {
            setFileTreeRefreshCounter((c) => c + 1);
          }
        });
      }

      return () => {
        unsubscribeState();
        unsubscribeInferenceState();
        unsubscribeInferenceChunk();
        if (unsubscribeScan) unsubscribeScan();
        if (unsubscribeAgentActivity) unsubscribeAgentActivity();
        if (unsubscribeAgentState) unsubscribeAgentState();
        if (unsubscribeEditActivity) unsubscribeEditActivity();
        if (unsubscribeEditChunk) unsubscribeEditChunk();
        if (unsubscribeEditState) unsubscribeEditState();
      };

    }
  }, [refreshModelsAndLibraries]);

  const updateSettings = useCallback(async (partial: Partial<AppSettings>) => {
    if (typeof window !== 'undefined' && window.modelForge) {
      const updated = await window.modelForge.updateSettings(partial);
      setSettings(updated);
      if (updated.compactMode) {
        document.body.classList.add('compact-mode');
      } else {
        document.body.classList.remove('compact-mode');
      }
    } else {
      setSettings((prev) => ({ ...prev, ...partial }));
    }
  }, []);

  const handleAddProject = useCallback(async (): Promise<Project | null> => {
    if (typeof window === 'undefined' || !window.modelForge) {
      console.error('[ModelForge] Electron API bridge (window.modelForge) is unavailable');
      addToast('Desktop integration unavailable. Please restart Model Forge.', 'error');
      return null;
    }

    try {
      const newProj = await window.modelForge.addProject();
      if (newProj) {
        setProjects((prev) => {
          const filtered = prev.filter((p) => p.path !== newProj.path);
          return [...filtered, newProj];
        });
        setActiveProjectId(newProj.id);
        addToast(`Project "${newProj.name}" added successfully`, 'success');
        return newProj;
      }
      return null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ModelForge] Failed to add project:', err);
      addToast(`Could not select project directory: ${msg}`, 'error');
      return null;
    }
  }, [addToast]);

  const handleRemoveProject = useCallback(
    async (id: string): Promise<void> => {
      if (typeof window !== 'undefined' && window.modelForge) {
        await window.modelForge.removeProject(id);
        setProjects((prev) => prev.filter((p) => p.id !== id));
        setActiveProjectId((prev) => (prev === id ? null : prev));
        addToast('Project removed', 'info');
      }
    },
    [addToast]
  );

  // Model Library Actions
  const handleAddModelLibrary = useCallback(
    async (dirPath?: string): Promise<string | null> => {
      if (typeof window === 'undefined' || !window.modelForge) {
        console.error('[ModelForge] Electron API bridge (window.modelForge) is unavailable');
        addToast('Desktop integration unavailable. Please restart Model Forge.', 'error');
        return null;
      }

      try {
        const added = await window.modelForge.addModelLibrary(dirPath);
        if (added) {
          await refreshModelsAndLibraries();
          addToast(`Added model library: ${added}`, 'success');
          return added;
        }
        // User canceled dialog
        return null;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[ModelForge] Failed to add library:', err);
        addToast(`Could not open model folder picker: ${msg}`, 'error');
        return null;
      }
    },
    [addToast, refreshModelsAndLibraries]
  );

  const handleRemoveModelLibrary = useCallback(
    async (dirPath: string): Promise<boolean> => {
      if (typeof window !== 'undefined' && window.modelForge) {
        try {
          setIsScanning(true);
          const removed = await window.modelForge.removeModelLibrary(dirPath);
          if (removed) {
            await refreshModelsAndLibraries();
            addToast(`Removed library root (files kept on disk)`, 'info');
            return true;
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          addToast(`Failed to remove library: ${msg}`, 'error');
        } finally {
          setIsScanning(false);
        }
      }
      return false;
    },
    [addToast, refreshModelsAndLibraries]
  );

  const handleScanModelLibrary = useCallback(
    async (dirPath: string): Promise<void> => {
      if (typeof window !== 'undefined' && window.modelForge) {
        try {
          setIsScanning(true);
          await window.modelForge.scanModelLibrary(dirPath);
          await refreshModelsAndLibraries();
          addToast('Model library scanned.', 'info');
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          addToast(`Scan failed: ${msg}`, 'error');
        } finally {
          setIsScanning(false);
        }
      }
    },
    [addToast, refreshModelsAndLibraries]
  );

  const handleScanAllModelLibraries = useCallback(async (): Promise<void> => {
    if (typeof window !== 'undefined' && window.modelForge) {
      try {
        setIsScanning(true);
        const updated = await window.modelForge.scanAllModelLibraries();
        setModels(updated);
        await refreshModelsAndLibraries();
        addToast(`Scan complete: ${updated.length} models discovered.`, 'success');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        addToast(`Scan failed: ${msg}`, 'error');
      } finally {
        setIsScanning(false);
      }
    }
  }, [addToast, refreshModelsAndLibraries]);

  // Local Inference & Streaming Chat Actions (Pass 3)
  const handleLoadModel = useCallback(
    async (modelId: string, contextSize?: number): Promise<ActiveModelInfo | null> => {
      if (typeof window !== 'undefined' && window.modelForge) {
        try {
          addToast('Loading model into local memory...', 'info');
          const loaded = await window.modelForge.loadModel(modelId, contextSize);
          addToast(`Model "${loaded.name}" loaded successfully`, 'success');
          return loaded;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          addToast(`Failed to load model: ${msg}`, 'error');
          return null;
        }
      }
      return null;
    },
    [addToast]
  );

  const handleUnloadModel = useCallback(async (): Promise<boolean> => {
    if (typeof window !== 'undefined' && window.modelForge) {
      try {
        const result = await window.modelForge.unloadModel();
        if (result) {
          addToast('Model unloaded', 'info');
        }
        return result;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        addToast(`Failed to unload model: ${msg}`, 'error');
        return false;
      }
    }
    return false;
  }, [addToast]);

  const handleSendChatMessage = useCallback(
    async (prompt: string): Promise<void> => {
      if (!prompt.trim()) return;

      if (!inferenceState?.activeModel) {
        addToast('Please load a model from the Models library first', 'warning');
        return;
      }

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: prompt,
        timestamp: Date.now(),
      };

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
      };

      setChatMessages((prev) => [...prev, userMsg, assistantMsg]);

      if (typeof window !== 'undefined' && window.modelForge) {
        try {
          await window.modelForge.sendChatMessage({ prompt });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          addToast(`Generation error: ${msg}`, 'error');
          setChatMessages((prev) => {
            const updated = [...prev];
            const lastIndex = updated.length - 1;
            if (lastIndex >= 0 && updated[lastIndex].role === 'assistant') {
              updated[lastIndex] = {
                ...updated[lastIndex],
                content: updated[lastIndex].content || `Error: ${msg}`,
                isStreaming: false,
              };
            }
            return updated;
          });
        }
      }
    },
    [addToast, inferenceState]
  );

  const handleStopGeneration = useCallback(async (): Promise<boolean> => {
    if (typeof window !== 'undefined' && window.modelForge) {
      return window.modelForge.stopGeneration();
    }
    return false;
  }, []);

  const handleClearChat = useCallback(async (): Promise<boolean> => {
    if (typeof window !== 'undefined' && window.modelForge) {
      await window.modelForge.clearChat();
      setChatMessages([]);
      addToast('Conversation cleared', 'info');
      return true;
    }
    setChatMessages([]);
    return true;
  }, [addToast]);

  const activeProject = projects.find((p) => p.id === activeProjectId) || null;
  const selectedModel = models.find((m) => m.id === selectedModelId) || null;
  const activeModel = inferenceState?.activeModel || null;
  const isGenerating = inferenceState?.generationState === 'generating';

  const handleSetActiveProjectId = useCallback((id: string | null) => {
    setActiveProjectId(id);
    setPermissionLevel('READ');
    setIsRecoveryBannerDismissed(false);
    if (typeof window !== 'undefined' && window.modelForge?.setActiveProject) {
      window.modelForge.setActiveProject(id).catch(console.error);
    }
  }, []);

  const refreshPendingCheckpointAndDiff = useCallback(async () => {
    if (typeof window === 'undefined' || !window.modelForge || !activeProjectId) {
      setPendingCheckpoint(null);
      setCheckpointDiff(null);
      return;
    }
    try {
      const pending = await window.modelForge.getPendingCheckpoint(activeProjectId);
      setPendingCheckpoint(pending);
      if (pending?.id) {
        const diff = await window.modelForge.getCheckpointDiff(pending.id, activeProjectId);
        setCheckpointDiff(diff);
      } else {
        setCheckpointDiff(null);
      }
    } catch (err) {
      console.error('[AppStore] Failed to refresh checkpoint and diff:', err);
    }
  }, [activeProjectId]);

  useEffect(() => {
    refreshPendingCheckpointAndDiff();
  }, [activeProjectId, refreshPendingCheckpointAndDiff]);

  const confirmEnableEdit = useCallback(() => {
    setPermissionLevel('EDIT');
    setEditPermissionModalOpen(false);
    addToast('Edit mode enabled for active project in this session.', 'info');
  }, [addToast]);

  const handleRunPlanAgent = useCallback(
    async (prompt: string) => {
      const activeProj = projects.find((p) => p.id === activeProjectId);
      if (!activeProj) {
        addToast('Select or add a project first to run Plan Agent.', 'warning');
        return;
      }

      if (!activeModel) {
        addToast('No model loaded. Open Models library to load a GGUF model first.', 'warning');
        return;
      }

      setIsPlanning(true);
      setActiveTab('chat');

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: prompt,
        timestamp: Date.now(),
      };

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        kind: 'plan',
        isStreaming: true,
      };

      setChatMessages((prev) => [...prev, userMsg, assistantMsg]);

      if (typeof window !== 'undefined' && window.modelForge?.runPlanAgent) {
        try {
          const res = await window.modelForge.runPlanAgent({
            projectId: activeProj.id,
            prompt,
          });
          if (res?.runId) {
            setActiveRunId(res.runId);
            activeRunIdRef.current = res.runId;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          addToast(`Planning failed: ${msg}`, 'error');
          setIsPlanning(false);
          setChatMessages((prev) => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
              updated[lastIdx] = {
                ...updated[lastIdx],
                content: `Error: ${msg}`,
                isStreaming: false,
              };
            }
            return updated;
          });
        }
      }
    },
    [activeProjectId, projects, activeModel, addToast, setActiveTab]
  );

  const handleStopPlanAgent = useCallback(async (): Promise<boolean> => {
    if (typeof window !== 'undefined' && window.modelForge?.stopPlanAgent) {
      const stopped = await window.modelForge.stopPlanAgent();
      setIsPlanning(false);
      return stopped;
    }
    setIsPlanning(false);
    return false;
  }, []);

  const handleRunEditAgent = useCallback(
    async (prompt: string) => {
      const activeProj = projects.find((p) => p.id === activeProjectId);
      if (!activeProj) {
        addToast('Select or add a project first to run Edit Agent.', 'warning');
        return;
      }

      if (!activeModel) {
        addToast('No model loaded. Open Models library to load a GGUF model first.', 'warning');
        return;
      }

      if (permissionLevel !== 'EDIT') {
        setEditPermissionModalOpen(true);
        return;
      }

      setIsEditing(true);
      setActiveTab('chat');

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: prompt,
        timestamp: Date.now(),
      };

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        kind: 'edit-result',
        isStreaming: true,
      };

      setChatMessages((prev) => [...prev, userMsg, assistantMsg]);

      if (typeof window !== 'undefined' && window.modelForge?.runEditAgent) {
        try {
          const res = await window.modelForge.runEditAgent({
            projectId: activeProj.id,
            prompt,
          });
          if (res?.runId) {
            setActiveRunId(res.runId);
            activeRunIdRef.current = res.runId;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          addToast(`Edit Agent failed: ${msg}`, 'error');
          setIsEditing(false);
          setChatMessages((prev) => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
              updated[lastIdx] = {
                ...updated[lastIdx],
                content: `Error: ${msg}`,
                isStreaming: false,
              };
            }
            return updated;
          });
        }
      }
    },
    [activeProjectId, projects, activeModel, permissionLevel, addToast, setActiveTab]
  );

  const handleStopEditAgent = useCallback(async (): Promise<boolean> => {
    if (typeof window !== 'undefined' && window.modelForge?.stopEditAgent) {
      const stopped = await window.modelForge.stopEditAgent();
      setIsEditing(false);
      await refreshPendingCheckpointAndDiff();
      return stopped;
    }
    setIsEditing(false);
    return false;
  }, [refreshPendingCheckpointAndDiff]);

  const handleAcceptCheckpoint = useCallback(async () => {
    if (!activeProjectId || !pendingCheckpoint) return;
    try {
      await window.modelForge.acceptCheckpoint(pendingCheckpoint.id, activeProjectId);
      addToast('Changes accepted.', 'success');
      await refreshPendingCheckpointAndDiff();
      setFileTreeRefreshCounter((c) => c + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast(`Accept failed: ${msg}`, 'error');
    }
  }, [activeProjectId, pendingCheckpoint, addToast, refreshPendingCheckpointAndDiff]);

  const handleRollbackCheckpoint = useCallback(async (): Promise<RollbackResult | null> => {
    if (!activeProjectId || !pendingCheckpoint) return null;
    try {
      const result = await window.modelForge.rollbackCheckpoint(pendingCheckpoint.id, activeProjectId);
      if (result.success) {
        addToast(`Rollback complete. Restored ${result.restoredFiles.length} file(s).`, 'success');
        await refreshPendingCheckpointAndDiff();
        setFileTreeRefreshCounter((c) => c + 1);
        return result;
      } else {
        if (result.conflicts && result.conflicts.length > 0) {
          addToast(`Rollback conflict: ${result.conflicts[0].reason}`, 'error');
        } else {
          addToast(`Rollback failed: ${result.error || 'Unknown error'}`, 'error');
        }
        await refreshPendingCheckpointAndDiff();
        return result;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast(`Rollback failed: ${msg}`, 'error');
      return null;
    }
  }, [activeProjectId, pendingCheckpoint, addToast, refreshPendingCheckpointAndDiff]);

  const handleCreateManualCheckpoint = useCallback(
    async (description?: string): Promise<CheckpointSummary | null> => {
      if (!activeProjectId) {
        addToast('No active project selected to create checkpoint.', 'warning');
        return null;
      }
      try {
        const summary = await window.modelForge.createManualCheckpoint(activeProjectId, description);
        addToast(
          `Checkpoint created (${summary.id.slice(0, 16)}...) at ${new Date(summary.timestamp).toLocaleTimeString()}`,
          'success'
        );
        return summary;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        addToast(`Checkpoint creation failed: ${msg}`, 'error');
        return null;
      }
    },
    [activeProjectId, addToast]
  );

  const dismissRecoveryBanner = useCallback(() => {
    setIsRecoveryBannerDismissed(true);
  }, []);

  const handleClearAgentActivities = useCallback(() => {
    setAgentActivities([]);
    setAgentPlanState(null);
    setEditAgentState(null);
    setActiveRunId(null);
    activeRunIdRef.current = null;
  }, []);

  // Global Ctrl+K shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <AppStoreContext.Provider
      value={{
        currentPage,
        setCurrentPage,
        activeTab,
        setActiveTab,
        settings,
        updateSettings,
        projects,
        activeProject,
        setActiveProjectId: handleSetActiveProjectId,
        addProject: handleAddProject,
        removeProject: handleRemoveProject,

        // Permission Model (Pass 5)
        permissionLevel,
        setPermissionLevel,
        isEditPermissionModalOpen,
        setEditPermissionModalOpen,
        confirmEnableEdit,

        models,
        modelLibraries,
        primaryDriveStorage,
        selectedModelId,
        setSelectedModelId,
        selectedModel,
        isScanning,
        scanProgress,
        addModelLibrary: handleAddModelLibrary,
        removeModelLibrary: handleRemoveModelLibrary,
        scanModelLibrary: handleScanModelLibrary,
        scanAllModelLibraries: handleScanAllModelLibraries,
        refreshModelsAndLibraries,

        // Inference (Pass 3)
        inferenceState,
        activeModel,
        chatMessages,
        isGenerating,
        loadModel: handleLoadModel,
        unloadModel: handleUnloadModel,
        sendChatMessage: handleSendChatMessage,
        stopGeneration: handleStopGeneration,
        clearChat: handleClearChat,

        // Plan Agent (Pass 4)
        agentActivities,
        agentPlanState,
        isPlanning,
        activeRunId,
        runPlanAgent: handleRunPlanAgent,
        stopPlanAgent: handleStopPlanAgent,
        clearAgentActivities: handleClearAgentActivities,

        // Edit Agent & Checkpoints (Pass 5)
        isEditing,
        editAgentState,
        pendingCheckpoint,
        checkpointDiff,
        runEditAgent: handleRunEditAgent,
        stopEditAgent: handleStopEditAgent,
        acceptCheckpoint: handleAcceptCheckpoint,
        rollbackCheckpoint: handleRollbackCheckpoint,
        createManualCheckpoint: handleCreateManualCheckpoint,
        refreshPendingCheckpointAndDiff,
        dismissRecoveryBanner,
        isRecoveryBannerDismissed,
        fileTreeRefreshCounter,

        hardwareInfo,
        toasts,
        addToast,
        removeToast,
        isCommandPaletteOpen,
        setCommandPaletteOpen,
        isMaximized,
      }}
    >
      {children}
    </AppStoreContext.Provider>
  );
};

export const useAppStore = (): AppStoreContextType => {
  const context = useContext(AppStoreContext);
  if (!context) {
    throw new Error('useAppStore must be used within an AppStoreProvider');
  }
  return context;
};
