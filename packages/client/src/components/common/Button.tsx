import React, { ButtonHTMLAttributes, forwardRef } from 'react';
import styles from './Button.module.css';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'medium',
      fullWidth = false,
      loading = false,
      icon,
      iconPosition = 'left',
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const buttonClasses = [
      styles.button,
      styles[variant],
      styles[size],
      fullWidth && styles.fullWidth,
      loading && styles.loading,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        ref={ref}
        className={buttonClasses}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <span className={styles.spinner} aria-label="Loading" />
        ) : (
          <>
            {icon && iconPosition === 'left' && (
              <span className={styles.icon}>{icon}</span>
            )}
            {children && <span className={styles.text}>{children}</span>}
            {icon && iconPosition === 'right' && (
              <span className={styles.icon}>{icon}</span>
            )}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';