'use client';

import React from 'react';
import { Search, X } from 'lucide-react';
import styles from './SearchField.module.css';

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label?: string;
  autoFocus?: boolean;
  className?: string;
}

export default function SearchField({ value, onChange, placeholder, label, autoFocus, className }: SearchFieldProps) {
  return (
    <div className={`${styles.field} ${className ?? ''}`}>
      <Search size={18} aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="search"
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Effacer">
          <X size={18} />
        </button>
      )}
    </div>
  );
}
