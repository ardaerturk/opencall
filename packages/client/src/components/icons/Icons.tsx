import React from 'react';

interface IconProps {
  size?: number;
  color?: string;
  className?: string;
}

export const MicrophoneIcon: React.FC<IconProps> = ({ 
  size = 20, 
  color = 'currentColor',
  className 
}) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M12 1C10.34 1 9 2.34 9 4V12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12V4C15 2.34 13.66 1 12 1Z" 
      fill={color}
    />
    <path 
      d="M17 12C17 14.76 14.76 17 12 17C9.24 17 7 14.76 7 12H5C5 15.53 7.61 18.43 11 18.92V23H13V18.92C16.39 18.43 19 15.53 19 12H17Z" 
      fill={color}
    />
  </svg>
);

export const MicrophoneOffIcon: React.FC<IconProps> = ({ 
  size = 20, 
  color = 'currentColor',
  className 
}) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M15 12V4C15 2.34 13.66 1 12 1C10.34 1 9 2.34 9 4V10.17L15 16.17V12Z" 
      fill={color}
    />
    <path 
      d="M2.1 2.1L0.69 3.51L8.98 11.8C8.98 11.87 9 11.93 9 12C9 13.66 10.34 15 12 15C12.23 15 12.44 14.96 12.65 14.9L14.31 16.56C13.6 16.83 12.81 17 12 17C9.24 17 7 14.76 7 12H5C5 15.53 7.61 18.43 11 18.92V23H13V18.92C14.84 18.67 16.45 17.82 17.64 16.64L20.49 19.49L21.9 18.08L2.1 2.1Z" 
      fill={color}
    />
    <path 
      d="M19 12H17C17 12.91 16.76 13.75 16.36 14.5L17.85 16C18.57 14.87 19 13.48 19 12Z" 
      fill={color}
    />
  </svg>
);

export const VideoIcon: React.FC<IconProps> = ({ 
  size = 20, 
  color = 'currentColor',
  className 
}) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M17 10.5V7C17 6.45 16.55 6 16 6H4C3.45 6 3 6.45 3 7V17C3 17.55 3.45 18 4 18H16C16.55 18 17 17.55 17 17V13.5L21 17.5V6.5L17 10.5Z" 
      fill={color}
    />
  </svg>
);

export const VideoOffIcon: React.FC<IconProps> = ({ 
  size = 20, 
  color = 'currentColor',
  className 
}) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M21 6.5L17 10.5V7C17 6.45 16.55 6 16 6H9.82L21 17.18V6.5Z" 
      fill={color}
    />
    <path 
      d="M3.27 2L2 3.27L4.73 6H4C3.45 6 3 6.45 3 7V17C3 17.55 3.45 18 4 18H16C16.21 18 16.39 17.92 16.54 17.82L19.73 21L21 19.73L3.27 2Z" 
      fill={color}
    />
  </svg>
);

export const ScreenShareIcon: React.FC<IconProps> = ({ 
  size = 20, 
  color = 'currentColor',
  className 
}) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M20 18C21.1 18 21.99 17.1 21.99 16L22 6C22 4.89 21.1 4 20 4H4C2.89 4 2 4.89 2 6V16C2 17.1 2.89 18 4 18H0V20H24V18H20ZM4 16V6H20V16H4Z" 
      fill={color}
    />
    <path 
      d="M12 7L16 11H13V14H11V11H8L12 7Z" 
      fill={color}
    />
  </svg>
);

export const PhoneOffIcon: React.FC<IconProps> = ({ 
  size = 20, 
  color = 'currentColor',
  className 
}) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M12 9C10.4 7.8 8.6 7.1 6.6 6.6L5.2 9.2C5.7 9.3 6.1 9.5 6.6 9.7L3.9 12.4C3.1 11.9 2.3 11.3 1.7 10.6C1.3 10.1 1.3 9.4 1.7 8.9L4.8 5.8C5 5.6 5.3 5.5 5.7 5.5C6.5 5.5 7.7 5.9 9.2 6.6L11.4 4.4C9.2 3.4 7.2 2.9 5.7 2.9C4.9 2.9 4.1 3.2 3.5 3.8L0.4 6.9C-0.5 7.8 -0.5 9.2 0.4 10.2C1.2 11 2.1 11.7 3.1 12.3L1.7 13.7L3.1 15.1L21.8 6.4L20.4 5L12 9Z" 
      fill={color}
    />
    <path 
      d="M20.3 15.1C20.7 15.6 20.7 16.3 20.3 16.8L17.2 19.9C17 20.1 16.7 20.2 16.3 20.2C15.5 20.2 14.3 19.8 12.8 19.1L9.6 22.3L11 23.7L14.3 20.5C16.5 21.5 18.5 22 20 22C20.8 22 21.6 21.7 22.2 21.1L23.6 19.7C24.5 18.8 24.5 17.4 23.6 16.4C22.8 15.6 21.9 14.9 20.9 14.3L19.5 15.7C20 15.9 20.4 16.1 20.9 16.4L20.3 15.1Z" 
      fill={color}
    />
  </svg>
);

export const SettingsIcon: React.FC<IconProps> = ({ 
  size = 20, 
  color = 'currentColor',
  className 
}) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M12 15.5C10.07 15.5 8.5 13.93 8.5 12C8.5 10.07 10.07 8.5 12 8.5C13.93 8.5 15.5 10.07 15.5 12C15.5 13.93 13.93 15.5 12 15.5ZM19.43 12.97C19.47 12.65 19.5 12.33 19.5 12C19.5 11.67 19.47 11.34 19.43 11L21.54 9.37C21.73 9.22 21.78 8.95 21.66 8.73L19.66 5.27C19.54 5.05 19.27 4.96 19.05 5.05L16.56 6.05C16.04 5.66 15.5 5.32 14.87 5.07L14.5 2.42C14.46 2.18 14.25 2 14 2H10C9.75 2 9.54 2.18 9.5 2.42L9.13 5.07C8.5 5.32 7.96 5.66 7.44 6.05L4.95 5.05C4.73 4.96 4.46 5.05 4.34 5.27L2.34 8.73C2.21 8.95 2.27 9.22 2.46 9.37L4.57 11C4.53 11.34 4.5 11.67 4.5 12C4.5 12.33 4.53 12.65 4.57 12.97L2.46 14.63C2.27 14.78 2.21 15.05 2.34 15.27L4.34 18.73C4.46 18.95 4.73 19.03 4.95 18.95L7.44 17.94C7.96 18.34 8.5 18.68 9.13 18.93L9.5 21.58C9.54 21.82 9.75 22 10 22H14C14.25 22 14.46 21.82 14.5 21.58L14.87 18.93C15.5 18.67 16.04 18.34 16.56 17.94L19.05 18.95C19.27 19.03 19.54 18.95 19.66 18.73L21.66 15.27C21.78 15.05 21.73 14.78 21.54 14.63L19.43 12.97Z" 
      fill={color}
    />
  </svg>
);

export const MoreIcon: React.FC<IconProps> = ({ 
  size = 20, 
  color = 'currentColor',
  className 
}) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <circle cx="12" cy="12" r="2" fill={color} />
    <circle cx="19" cy="12" r="2" fill={color} />
    <circle cx="5" cy="12" r="2" fill={color} />
  </svg>
);

export const CloseIcon: React.FC<IconProps> = ({ 
  size = 20, 
  color = 'currentColor',
  className 
}) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" 
      fill={color}
    />
  </svg>
);

export const CopyIcon: React.FC<IconProps> = ({ 
  size = 20, 
  color = 'currentColor',
  className 
}) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM19 21H8V7H19V21Z" 
      fill={color}
    />
  </svg>
);

export const CheckIcon: React.FC<IconProps> = ({ 
  size = 20, 
  color = 'currentColor',
  className 
}) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M9 16.17L4.83 12L3.41 13.41L9 19L21 7L19.59 5.59L9 16.17Z" 
      fill={color}
    />
  </svg>
);

export const InfoIcon: React.FC<IconProps> = ({ 
  size = 20, 
  color = 'currentColor',
  className 
}) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V11H13V17ZM13 9H11V7H13V9Z" 
      fill={color}
    />
  </svg>
);

export const LinkIcon: React.FC<IconProps> = ({ 
  size = 20, 
  color = 'currentColor',
  className 
}) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M3.9 12C3.9 10.29 5.29 8.9 7 8.9H11V7H7C4.24 7 2 9.24 2 12C2 14.76 4.24 17 7 17H11V15.1H7C5.29 15.1 3.9 13.71 3.9 12ZM8 13H16V11H8V13ZM17 7H13V8.9H17C18.71 8.9 20.1 10.29 20.1 12C20.1 13.71 18.71 15.1 17 15.1H13V17H17C19.76 17 22 14.76 22 12C22 9.24 19.76 7 17 7Z" 
      fill={color}
    />
  </svg>
);