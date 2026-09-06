import React, { useState, useMemo } from 'react';
import {
  Box,
  FolderPlus,
  RefreshCw,
  Search,
  Filter,
  ArrowDownUp,
  FolderOpen,
} from 'lucide-react';
import { useAppStore } from '@/store/AppStoreContext';
import { ModelRecord } from '@shared/types';
import { LibraryRootsCard } from './models/LibraryRootsCard';
import { ModelCard } from './models/ModelCard';
import { ModelDetailsModal } from './models/ModelDetailsModal';
import './ModelsPage.css';

type SortOption = 'name' | 'size-desc' | 'size-asc' | 'date-desc';

export const ModelsPage: React.FC = () => {
  const {
    models,
    modelLibraries,
    addModelLibrary,
    scanAllModelLibraries,
    isScanning,
    selectedModel,
    setSelectedModelId,
  } = useAppStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [archFilter, setArchFilter] = useState('ALL');
  const [quantFilter, setQuantFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [activeModalModel, setActiveModalModel] = useState<ModelRecord | null>(null);

  // Available unique architectures and quantizations for filter dropdowns
  const availableArchitectures = useMemo(() => {
    const set = new Set<string>();
    for (const m of models) {
      if (m.architecture) set.add(m.architecture);
    }
    return Array.from(set).sort();
  }, [models]);

  const availableQuantizations = useMemo(() => {
    const set = new Set<string>();
    for (const m of models) {
      if (m.quantization) set.add(m.quantization);
    }
    return Array.from(set).sort();
  }, [models]);

  // Filter and sort models
  const filteredModels = useMemo(() => {
    return models
      .filter((m) => {
        // Text search
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchName = m.displayName.toLowerCase().includes(q);
          const matchFile = m.fileName.toLowerCase().includes(q);
          const matchArch = (m.architecture || '').toLowerCase().includes(q);
          const matchPath = m.path.toLowerCase().includes(q);
          if (!matchName && !matchFile && !matchArch && !matchPath) return false;
        }

        // Architecture filter
        if (archFilter !== 'ALL' && m.architecture !== archFilter) {
          return false;
        }

        // Quantization filter
        if (quantFilter !== 'ALL' && m.quantization !== quantFilter) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name') {
          return a.displayName.localeCompare(b.displayName);
        }
        if (sortBy === 'size-desc') {
          return b.sizeBytes - a.sizeBytes;
        }
        if (sortBy === 'size-asc') {
          return a.sizeBytes - b.sizeBytes;
        }
        if (sortBy === 'date-desc') {
          return b.mtimeMs - a.mtimeMs;
        }
        return 0;
      });
  }, [models, searchQuery, archFilter, quantFilter, sortBy]);

  // If a model was selected via sidebar, open its details
  React.useEffect(() => {
    if (selectedModel) {
      setActiveModalModel(selectedModel);
    }
  }, [selectedModel]);

  const handleModalClose = () => {
    setActiveModalModel(null);
    setSelectedModelId(null);
  };

  return (
    <div className="models-page">
      {/* Page Header */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Models</h1>
          <p className="page-subtitle">Your local model library</p>
        </div>
        <div className="page-actions">
          <button
            className="btn btn-secondary"
            onClick={() => scanAllModelLibraries()}
            disabled={isScanning || modelLibraries.length === 0}
          >
            <RefreshCw size={13} className={isScanning ? 'spinning' : ''} />
            <span>{isScanning ? 'Scanning...' : 'Scan All'}</span>
          </button>
          <button
            className="btn btn-primary"
            onClick={() => addModelLibrary()}
            disabled={isScanning}
          >
            <FolderPlus size={14} />
            <span>Add Model Folder</span>
          </button>
        </div>
      </div>

      {/* 1. Configured Library Roots */}
      <LibraryRootsCard />

      {/* 2. Filter, Search & Sort Toolbar */}
      <div className="panel models-toolbar-panel">
        <div className="models-search-box">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            className="models-search-input"
            placeholder="Search models by name, architecture, or filename..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="clear-search-btn" onClick={() => setSearchQuery('')}>
              ✕
            </button>
          )}
        </div>

        <div className="models-filters-group">
          {/* Architecture Filter */}
          <div className="filter-item">
            <Filter size={12} className="filter-icon" />
            <select
              className="models-select"
              value={archFilter}
              onChange={(e) => setArchFilter(e.target.value)}
            >
              <option value="ALL">All Architectures</option>
              {availableArchitectures.map((arch) => (
                <option key={arch} value={arch}>
                  {arch}
                </option>
              ))}
            </select>
          </div>

          {/* Quantization Filter */}
          <div className="filter-item">
            <select
              className="models-select"
              value={quantFilter}
              onChange={(e) => setQuantFilter(e.target.value)}
            >
              <option value="ALL">All Quantizations</option>
              {availableQuantizations.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Option */}
          <div className="filter-item">
            <ArrowDownUp size={12} className="filter-icon" />
            <select
              className="models-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
            >
              <option value="name">Sort: Name (A-Z)</option>
              <option value="size-desc">Sort: Size (Largest)</option>
              <option value="size-asc">Sort: Size (Smallest)</option>
              <option value="date-desc">Sort: Recently Modified</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Models Grid or Empty States */}
      {models.length === 0 ? (
        <div className="panel models-empty-panel">
          <div className="models-empty-state">
            <div className="models-empty-icon-wrap">
              <Box size={36} className="text-secondary" strokeWidth={1.5} />
            </div>
            <h3 className="empty-title">No models found yet</h3>
            <p className="empty-desc">
              Add the folder containing your local GGUF models. Model Forge discovers, verifies,
              and inspects quantized weights directly on your hardware without third-party services.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => addModelLibrary()}
              disabled={isScanning}
            >
              <FolderOpen size={14} />
              <span>Choose GGUF Folder</span>
            </button>
          </div>
        </div>
      ) : filteredModels.length === 0 ? (
        <div className="panel models-empty-panel">
          <div className="models-empty-state">
            <h3 className="empty-title">No matching models</h3>
            <p className="empty-desc">
              No models match your current search query or filter selections.
            </p>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setSearchQuery('');
                setArchFilter('ALL');
                setQuantFilter('ALL');
              }}
            >
              Reset Filters
            </button>
          </div>
        </div>
      ) : (
        <div className="models-grid">
          {filteredModels.map((m) => (
            <ModelCard
              key={m.id}
              model={m}
              onSelect={(selected) => setActiveModalModel(selected)}
            />
          ))}
        </div>
      )}

      {/* Model Details Modal Drawer */}
      <ModelDetailsModal model={activeModalModel} onClose={handleModalClose} />
    </div>
  );
};
