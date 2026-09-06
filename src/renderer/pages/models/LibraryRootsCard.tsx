import React from 'react';
import { FolderPlus, RefreshCw, Folder, Trash2, HardDrive, Clock } from 'lucide-react';
import { useAppStore } from '@/store/AppStoreContext';
import './LibraryRootsCard.css';

export const LibraryRootsCard: React.FC = () => {
  const {
    modelLibraries,
    addModelLibrary,
    removeModelLibrary,
    scanModelLibrary,
    scanAllModelLibraries,
    isScanning,
  } = useAppStore();

  return (
    <div className="panel library-roots-card">
      <div className="library-roots-header">
        <div className="library-roots-title">
          <HardDrive size={15} className="text-secondary" />
          <span>Model Library Folders ({modelLibraries.length})</span>
        </div>
        <div className="library-roots-actions">
          <button
            className="btn btn-secondary"
            onClick={() => scanAllModelLibraries()}
            disabled={isScanning || modelLibraries.length === 0}
            title="Scan all configured model directories for .gguf files"
          >
            <RefreshCw size={12} className={isScanning ? 'spinning' : ''} />
            <span>{isScanning ? 'Scanning...' : 'Scan All'}</span>
          </button>
          <button
            className="btn btn-primary"
            onClick={() => addModelLibrary()}
            disabled={isScanning}
            title="Add a new directory containing local GGUF models"
          >
            <FolderPlus size={13} />
            <span>Add Model Folder</span>
          </button>
        </div>
      </div>

      {modelLibraries.length === 0 ? (
        <div className="roots-empty-hint">
          <span>No model folders configured. Click "Add Model Folder" to discover local GGUF models on your system.</span>
        </div>
      ) : (
        <div className="roots-list">
          {modelLibraries.map((lib) => (
            <div key={lib.path} className="root-row">
              <div className="root-icon-box">
                <Folder size={16} />
              </div>
              <div className="root-info">
                <span className="root-path font-mono" title={lib.path}>
                  {lib.path}
                </span>
                <div className="root-sub">
                  <span className="root-count font-semibold text-primary">
                    {lib.modelCount} {lib.modelCount === 1 ? 'model' : 'models'}
                  </span>
                  {lib.lastScannedAt ? (
                    <span className="root-scanned">
                      <Clock size={10} /> Scanned {new Date(lib.lastScannedAt).toLocaleTimeString()}
                    </span>
                  ) : (
                    <span className="root-scanned">Not scanned yet</span>
                  )}
                </div>
              </div>

              <div className="root-actions">
                <button
                  className="btn btn-secondary btn-xs"
                  onClick={() => scanModelLibrary(lib.path)}
                  disabled={isScanning}
                  title="Rescan this folder for changes"
                >
                  <RefreshCw size={11} className={isScanning ? 'spinning' : ''} />
                  <span>Rescan</span>
                </button>
                <button
                  className="btn-delete-root"
                  onClick={() => removeModelLibrary(lib.path)}
                  disabled={isScanning}
                  title="Remove folder from Model Forge (files are NOT deleted from disk)"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
