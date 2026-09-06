import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import {
  AppSettings,
  DriveStorageInfo,
  HardwareInfo,
  ModelLibrary,
  ModelRecord,
  ModelScanProgress,
  NavigationPage,
  Project,
  WorkspaceTab,
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
    if (typeof window !== 'undefined' && window.modelForge) {
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

      window.modelForge.isMaximized().then(setIsMaximized).catch(console.error);

      refreshModelsAndLibraries();

      const unsubscribeState = window.modelForge.onWindowStateChange((max) => {
        setIsMaximized(max);
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

      return () => {
        unsubscribeState();
        if (unsubscribeScan) unsubscribeScan();
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
    if (typeof window !== 'undefined' && window.modelForge) {
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
    }
    return null;
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
      if (typeof window !== 'undefined' && window.modelForge) {
        try {
          setIsScanning(true);
          const added = await window.modelForge.addModelLibrary(dirPath);
          if (added) {
            await refreshModelsAndLibraries();
            addToast(`Added model library: ${added}`, 'success');
            return added;
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          addToast(`Failed to add library: ${msg}`, 'error');
        } finally {
          setIsScanning(false);
        }
      }
      return null;
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

  const activeProject = projects.find((p) => p.id === activeProjectId) || null;
  const selectedModel = models.find((m) => m.id === selectedModelId) || null;

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
        setActiveProjectId,
        addProject: handleAddProject,
        removeProject: handleRemoveProject,

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
