import React from 'react';
import styles from './UserManagement.module.css';

export const UserManagement: React.FC = () => {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>User Management</h1>
      <p className={styles.placeholder}>
        User management features including provisioning, roles, and permissions will be implemented here.
      </p>
    </div>
  );
};