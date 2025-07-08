import React from 'react';
import styles from './SSOConfiguration.module.css';

export const SSOConfiguration: React.FC = () => {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>SSO Configuration</h1>
      <p className={styles.placeholder}>
        SAML 2.0 SSO configuration for Okta, Azure AD, and Google Workspace will be implemented here.
      </p>
    </div>
  );
};