import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Hammer,
  Home,
  Box,
  FlaskConical,
  Users,
  Folder,
  Terminal,
  History,
  Settings,
  FolderPlus,
  HardDrive,
  LucideIcon,
} from 'lucide-react';
import { useAppStore } from '@/store/AppStoreContext';
import './CommandPalette.css';

interface CommandItem {
  id: string;
  label: string;
  description: string;
  category: 'Navigation' | 'Actions';
  icon: LucideIcon;
  action: () => void;
}

export const CommandPalette: React.FC = () => {
  const {
    isCommandPaletteOpen,
    setCommandPaletteOpen,
    setCurrentPage,
    addProject,
    addModelLibrary,
  } = useAppStore();

  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: CommandItem[] = [
    {
      id: 'nav-builder',
      label: 'Go to Builder',
      description: 'Open active prompt and agent workstation',
      category: 'Navigation',
      icon: Hammer,
      action: () => setCurrentPage('builder'),
    },
    {
      id: 'nav-home',
      label: 'Go to Home',
      description: 'System overview and quick start',
      category: 'Navigation',
      icon: Home,
      action: () => setCurrentPage('home'),
    },
    {
      id: 'nav-models',
      label: 'Go to Models',
      description: 'Local GGUF model library',
      category: 'Navigation',
      icon: Box,
      action: () => setCurrentPage('models'),
    },
    {
      id: 'nav-lab',
      label: 'Go to Model Lab',
      description: 'Benchmarks and model profiles',
      category: 'Navigation',
      icon: FlaskConical,
      action: () => setCurrentPage('model-lab'),
    },
    {
      id: 'nav-teams',
      label: 'Go to Teams',
      description: 'Multi-model agent team configuration',
      category: 'Navigation',
      icon: Users,
      action: () => setCurrentPage('teams'),
    },
    {
      id: 'nav-projects',
      label: 'Go to Projects',
      description: 'Manage registered local workspaces',
      category: 'Navigation',
      icon: Folder,
      action: () => setCurrentPage('projects'),
    },
    {
      id: 'nav-terminal',
      label: 'Go to Terminal',
      description: 'Integrated local project terminal',
      category: 'Navigation',
      icon: Terminal,
      action: () => setCurrentPage('terminal'),
    },
    {
      id: 'nav-history',
      label: 'Go to History',
      description: 'Session history and diff logs',
      category: 'Navigation',
      icon: History,
      action: () => setCurrentPage('history'),
    },
    {
      id: 'nav-settings',
      label: 'Go to Settings',
      description: 'Preferences, directories, and agent safety',
      category: 'Navigation',
      icon: Settings,
      action: () => setCurrentPage('settings'),
    },
    {
      id: 'action-add-project',
      label: 'Add Project Directory',
      description: 'Choose a local project folder from your computer',
      category: 'Actions',
      icon: FolderPlus,
      action: () => addProject(),
    },
    {
      id: 'action-add-model-dir',
      label: 'Select Model Directory',
      description: 'Set directory for local GGUF models',
      category: 'Actions',
      icon: HardDrive,
      action: () => addModelLibrary(),
    },
  ];

  const filtered = commands.filter((cmd) => {
    const q = search.toLowerCase().trim();
    return (
      cmd.label.toLowerCase().includes(q) ||
      cmd.description.toLowerCase().includes(q) ||
      cmd.category.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    if (isCommandPaletteOpen) {
      setSearch('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isCommandPaletteOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setCommandPaletteOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % (filtered.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
        setCommandPaletteOpen(false);
      }
    }
  };

  if (!isCommandPaletteOpen) return null;

  return (
    <div className="palette-backdrop" onClick={() => setCommandPaletteOpen(false)}>
      <div
        className="palette-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="palette-search-bar">
          <Search size={16} className="palette-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="palette-input"
            placeholder="Type a command or navigate... (e.g. 'Builder', 'Models', 'Add')"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="palette-esc-badge">ESC</span>
        </div>

        <div className="palette-results">
          {filtered.length === 0 ? (
            <div className="palette-empty">No matching commands found</div>
          ) : (
            filtered.map((cmd, idx) => {
              const Icon = cmd.icon;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  className={`palette-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    cmd.action();
                    setCommandPaletteOpen(false);
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <div className="palette-item-icon">
                    <Icon size={16} />
                  </div>
                  <div className="palette-item-text">
                    <div className="palette-item-label">{cmd.label}</div>
                    <div className="palette-item-desc">{cmd.description}</div>
                  </div>
                  <span className="palette-item-category">{cmd.category}</span>
                </div>
              );
            })
          )}
        </div>

        <div className="palette-footer">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> to navigate
          </span>
          <span>
            <kbd>↵</kbd> to select
          </span>
          <span>
            <kbd>esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
};
