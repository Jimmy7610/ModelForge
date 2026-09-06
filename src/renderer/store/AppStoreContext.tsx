import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { AppSettings, HardwareInfo, NavigationPage, Project, WorkspaceTab } from '@shared/types';
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
  selectModelFolder: () => Promise<string | null>;
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

  // Initialize from electron bridge
  useEffect(() => {
    if (typeof window !== 'undefined' && window.modelForge) {
      window.modelForge.getSettings().then((loadedSettings) => {
        if (loadedSettings) {
          setSettings(loadedSettings);
          if (loadedSettings.startupPage) {
            setCurrentPage(loadedSettings.startupPage);
          }
          if (loadedSettings.compactMode) {
            document.body.classList.add('compact-mode');
          }
        }
      }).catch(console.error);

      window.modelForge.getProjects().then((loadedProjects) => {
        if (loadedProjects && loadedProjects.length > 0) {
          setProjects(loadedProjects);
          setActiveProjectId(loadedProjects[0].id);
        }
      }).catch(console.error);

      window.modelForge.getHardwareInfo().then((info) => {
        setHardwareInfo(info);
      }).catch(console.error);

      window.modelForge.isMaximized().then(setIsMaximized).catch(console.error);

      const unsubscribe = window.modelForge.onWindowStateChange((max) => {
        setIsMaximized(max);
      });

      return () => {
        unsubscribe();
      };
    }
  }, []);

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

  const handleRemoveProject = useCallback(async (id: string): Promise<void> => {
    if (typeof window !== 'undefined' && window.modelForge) {
      await window.modelForge.removeProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      setActiveProjectId((prev) => (prev === id ? null : prev));
      addToast('Project removed', 'info');
    }
  }, [addToast]);

  const handleSelectModelFolder = useCallback(async (): Promise<string | null> => {
    if (typeof window !== 'undefined' && window.modelForge) {
      const folder = await window.modelForge.selectModelFolder();
      if (folder) {
        setSettings((prev) => ({ ...prev, modelDirectory: folder }));
        addToast(`Model directory set to: ${folder}`, 'success');
        return folder;
      }
    }
    return null;
  }, [addToast]);

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
        selectModelFolder: handleSelectModelFolder,
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
