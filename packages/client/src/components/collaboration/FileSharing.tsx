import React, { useState, useCallback, useRef } from 'react';
import { IPFSService, FileUploadProgress, SharedFile } from '../../services/ipfs/IPFSService';
import styles from './FileSharing.module.css';

interface FileSharingProps {
  ipfsService: IPFSService;
  meetingId: string;
  onFileShared?: (file: SharedFile) => void;
}

export const FileSharing: React.FC<FileSharingProps> = ({
  ipfsService,
  meetingId,
  onFileShared
}) => {
  const [uploads, setUploads] = useState<Map<string, FileUploadProgress>>(new Map());
  const [sharedFiles, setSharedFiles] = useState<SharedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        await handleFileUpload(file);
      }
    }
  }, []);

  const handleFileUpload = async (file: File) => {
    try {
      const sharedFile = await ipfsService.uploadFile(
        file,
        meetingId,
        (progress) => {
          setUploads(prev => new Map(prev).set(progress.fileId, progress));
        }
      );

      setSharedFiles(prev => [...prev, sharedFile]);
      onFileShared?.(sharedFile);

      // Remove from uploads after a delay
      setTimeout(() => {
        setUploads(prev => {
          const next = new Map(prev);
          next.delete(sharedFile.id);
          return next;
        });
      }, 3000);
    } catch (error) {
      console.error('Failed to upload file:', error);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      files.forEach(handleFileUpload);
    }
  };

  const handleDownload = async (file: SharedFile) => {
    try {
      const { file: blob, metadata } = await ipfsService.downloadFile(
        file.ipfsHash,
        meetingId,
        (progress) => {
          console.log(`Download progress: ${progress} bytes`);
        }
      );

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = metadata.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download file:', error);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getUploadStatusIcon = (status: FileUploadProgress['status']) => {
    switch (status) {
      case 'preparing':
        return '📁';
      case 'encrypting':
        return '🔐';
      case 'uploading':
        return '📤';
      case 'complete':
        return '✅';
      case 'error':
        return '❌';
      default:
        return '📄';
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>File Sharing</h3>
        <button
          className={styles.uploadButton}
          onClick={() => fileInputRef.current?.click()}
        >
          Upload Files
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      <div
        className={`${styles.dropZone} ${dragActive ? styles.dragActive : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <p>Drag and drop files here or click to upload</p>
        <p className={styles.hint}>Files are encrypted before sharing</p>
      </div>

      {uploads.size > 0 && (
        <div className={styles.uploadsSection}>
          <h4>Uploading</h4>
          {Array.from(uploads.values()).map(upload => (
            <div key={upload.fileId} className={styles.uploadItem}>
              <span className={styles.statusIcon}>
                {getUploadStatusIcon(upload.status)}
              </span>
              <div className={styles.uploadInfo}>
                <p className={styles.fileName}>{upload.fileName}</p>
                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{
                      width: `${(upload.progress / upload.total) * 100}%`
                    }}
                  />
                </div>
                <p className={styles.status}>{upload.status}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {sharedFiles.length > 0 && (
        <div className={styles.filesSection}>
          <h4>Shared Files</h4>
          <div className={styles.filesList}>
            {sharedFiles.map(file => (
              <div key={file.id} className={styles.fileItem}>
                <div className={styles.fileIcon}>
                  {file.type.startsWith('image/') ? '🖼️' :
                   file.type.startsWith('video/') ? '🎥' :
                   file.type.startsWith('audio/') ? '🎵' :
                   file.type.includes('pdf') ? '📑' :
                   file.type.includes('zip') || file.type.includes('rar') ? '📦' :
                   '📄'}
                </div>
                <div className={styles.fileInfo}>
                  <p className={styles.fileName}>{file.name}</p>
                  <p className={styles.fileDetails}>
                    {formatFileSize(file.size)} • Shared by {file.uploadedBy.substring(0, 8)}
                  </p>
                </div>
                <button
                  className={styles.downloadButton}
                  onClick={() => handleDownload(file)}
                  title="Download file"
                >
                  ⬇️
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};