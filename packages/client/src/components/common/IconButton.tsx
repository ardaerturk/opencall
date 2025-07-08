import React, { ButtonHTMLAttributes, forwardRef } from 'react';
import styles from './IconButton.module.css';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  size?: 'small' | 'medium' | 'large';
  variant?: 'default' | 'danger' | 'ghost';
  active?: boolean;
  badge?: string | number;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      icon,
      size = 'medium',
      variant = 'default',
      active = false,
      badge,
      className = '',
      'aria-label': ariaLabel,
      ...props
    },
    ref
  ) => {
    const buttonClasses = [
      styles.iconButton,
      styles[size],
      styles[variant],
      active && styles.active,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        ref={ref}
        className={buttonClasses}
        aria-label={ariaLabel}
        {...props}
      >
        <span className={styles.iconWrapper}>{icon}</span>
        {badge !== undefined && (
          <span className={styles.badge}>{badge}</span>
        )}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';