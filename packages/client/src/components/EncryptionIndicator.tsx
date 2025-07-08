import React from 'react';
import { EncryptionStatus } from '../hooks/useEncryptedWebRTC';

interface EncryptionIndicatorProps {
  status: EncryptionStatus;
  className?: string;
  showDetails?: boolean;
}

export const EncryptionIndicator: React.FC<EncryptionIndicatorProps> = ({ 
  status, 
  className = '',
  showDetails = false 
}) => {
  const getStatusIcon = () => {
    if (!status.supported) {
      return (
        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      );
    }
    
    if (status.enabled) {
      return (
        <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      );
    }
    
    return (
      <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
      </svg>
    );
  };

  const getStatusText = () => {
    if (!status.supported) {
      return 'Encryption not supported';
    }
    
    if (status.enabled) {
      return 'End-to-end encrypted';
    }
    
    if (status.failureReason) {
      return 'Encryption failed';
    }
    
    return 'Not encrypted';
  };

  const getStatusColor = () => {
    if (!status.supported) return 'text-gray-500';
    if (status.enabled) return 'text-green-500';
    return 'text-red-500';
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative group">
        {getStatusIcon()}
        
        {/* Tooltip */}
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap">
          {getStatusText()}
          {showDetails && status.enabled && (
            <div className="mt-1 text-xs text-gray-300">
              <div>Group: {status.groupId?.substring(0, 8)}...</div>
              <div>Members: {status.memberCount}</div>
              <div>Epoch: {status.currentEpoch}</div>
            </div>
          )}
          {showDetails && status.failureReason && (
            <div className="mt-1 text-xs text-red-300">
              {status.failureReason}
            </div>
          )}
          
          {/* Tooltip arrow */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
            <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
      </div>
      
      {showDetails && (
        <span className={`text-sm font-medium ${getStatusColor()}`}>
          {getStatusText()}
        </span>
      )}
    </div>
  );
};

interface PeerEncryptionIndicatorProps {
  isEncrypted: boolean;
  peerId: string;
  className?: string;
}

export const PeerEncryptionIndicator: React.FC<PeerEncryptionIndicatorProps> = ({ 
  isEncrypted, 
  peerId,
  className = '' 
}) => {
  return (
    <div className={`absolute top-2 right-2 ${className}`}>
      {isEncrypted ? (
        <div className="bg-green-500 bg-opacity-90 rounded-full p-1.5" title="Encrypted connection">
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} 
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
      ) : (
        <div className="bg-red-500 bg-opacity-90 rounded-full p-1.5" title="Unencrypted connection">
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} 
                  d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
          </svg>
        </div>
      )}
    </div>
  );
};