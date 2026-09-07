import React from 'react';
import { Copy, Check } from 'lucide-react';
import { useCopyText } from '../hooks/useCopyText';
import './CopyButton.css';

export interface CopyButtonProps {
  /** The text to copy, or a function that returns the text dynamically */
  text: string | (() => string);
  /** Optional button label shown when idle (e.g. "Copy", "Copy Code", "Copy Plan") */
  label?: string;
  /** Label shown during the temporary copied state (default: "Copied") */
  successLabel?: string;
  /** Whether to render in compact padding */
  compact?: boolean;
  /** Whether button is disabled */
  disabled?: boolean;
  /** Tooltip shown on hover (title attribute) */
  tooltip?: string;
  /** Accessible label for screen readers */
  ariaLabel?: string;
  /** Additional CSS class names */
  className?: string;
  /** Lucide icon size in pixels (default: 13) */
  iconSize?: number;
  /** Callback fired after copy attempt */
  onCopy?: (success: boolean) => void;
}

export const CopyButton: React.FC<CopyButtonProps> = ({
  text,
  label,
  successLabel = 'Copied',
  compact = false,
  disabled = false,
  tooltip,
  ariaLabel,
  className = '',
  iconSize = 13,
  onCopy,
}) => {
  const { copied, copy } = useCopyText({
    timeout: 1800,
    onSuccess: () => onCopy?.(true),
    onError: () => onCopy?.(false),
  });

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (disabled || copied) return;

    const textToCopy = typeof text === 'function' ? text() : text;
    if (!textToCopy) return;

    await copy(textToCopy);
  };

  const defaultAria = label || tooltip || 'Copy to clipboard';
  const effectiveTooltip = copied ? successLabel : tooltip || label || 'Copy';
  const isIconOnly = !label;

  return (
    <button
      type="button"
      className={`mf-copy-btn ${compact ? 'compact' : ''} ${isIconOnly ? 'icon-only' : ''} ${copied ? 'copied' : ''} ${className}`.trim()}
      onClick={handleClick}
      disabled={disabled}
      title={effectiveTooltip}
      aria-label={ariaLabel || defaultAria}
      aria-live="polite"
    >
      {copied ? (
        <Check size={iconSize} className="mf-copy-icon text-success" />
      ) : (
        <Copy size={iconSize} className="mf-copy-icon" />
      )}
      {label && (
        <span className="mf-copy-label">
          {copied ? successLabel : label}
        </span>
      )}
    </button>
  );
};
