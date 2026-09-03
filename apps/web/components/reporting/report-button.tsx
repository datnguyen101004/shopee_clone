'use client';

import React, { useState } from 'react';
import type { ReportTargetType } from '@shopee-clone/contracts';
import { useAuthSession } from '../auth-session-provider';
import { ReportTargetDialog } from './report-target-dialog';

export interface ReportButtonProps {
  targetType: ReportTargetType;
  targetId: string;
  targetName: string;
  compact?: boolean;
  label?: string;
  className?: string;
}

export function ReportButton({
  targetType,
  targetId,
  targetName,
  compact = false,
  label,
  className,
}: ReportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { state: authState, authenticatedFetch } = useAuthSession();

  const defaultLabel = targetType === 'PRODUCT' ? 'Tố cáo' : 'Tố cáo Shop';
  const buttonLabel = label ?? defaultLabel;

  return (
    <div className={`report-control${compact ? ' report-control--compact' : ''}${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="report-button"
        aria-label={`Tố cáo ${targetType === 'PRODUCT' ? 'sản phẩm' : 'shop'}`}
        title={`Tố cáo ${targetType === 'PRODUCT' ? 'sản phẩm' : 'shop'}`}
      >
        <svg
          className="report-button__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
        {!compact ? <span className="report-button__label">{buttonLabel}</span> : null}
      </button>

      <ReportTargetDialog
        targetType={targetType}
        targetId={targetId}
        targetName={targetName}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        fetcher={authenticatedFetch}
        isAuthenticated={authState.status === 'authenticated'}
        onRequireAuth={() => {
          const returnTo = `${window.location.pathname}${window.location.search}`;
          window.location.href = `/login?returnTo=${encodeURIComponent(returnTo)}`;
        }}
      />
    </div>
  );
}
