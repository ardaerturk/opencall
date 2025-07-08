import { FastifyInstance } from 'fastify';
import * as saml2 from 'saml2-js';
import { AuthenticationManager } from '../AuthenticationManager';
import { logger } from '../../utils/logger';
import { redis } from '../../utils/redis';

export interface SAMLConfig {
  entityId: string;
  assertionConsumerServiceUrl: string;
  idpSsoUrl: string;
  idpCertificate: string;
  privateKey?: string;
  publicCert?: string;
}

export interface SAMLProvider {
  id: string;
  name: string;
  config: SAMLConfig;
  organizationId: string;
  enabled: boolean;
}

export class SAMLService {
  private providers: Map<string, saml2.ServiceProvider> = new Map();
  private authManager: AuthenticationManager;

  constructor(authManager: AuthenticationManager) {
    this.authManager = authManager;
  }

  async initializeProvider(provider: SAMLProvider): Promise<void> {
    try {
      const sp = new saml2.ServiceProvider({
        entity_id: provider.config.entityId,
        assert_endpoint: provider.config.assertionConsumerServiceUrl,
        private_key: provider.config.privateKey || '',
        certificate: provider.config.publicCert || '',
      });

      const idp = new saml2.IdentityProvider({
        sso_login_url: provider.config.idpSsoUrl,
        sso_logout_url: provider.config.idpSsoUrl.replace('/sso', '/logout'),
        certificates: [provider.config.idpCertificate],
      });

      this.providers.set(provider.id, sp);
      
      // Store IDP config in Redis
      await redis.set(
        `saml:idp:${provider.id}`,
        JSON.stringify({
          sso_login_url: provider.config.idpSsoUrl,
          sso_logout_url: provider.config.idpSsoUrl.replace('/sso', '/logout'),
          certificates: [provider.config.idpCertificate],
        }),
        'EX',
        86400 * 30 // 30 days
      );

      logger.info(`SAML provider initialized: ${provider.name} (${provider.id})`);
    } catch (error) {
      logger.error('Failed to initialize SAML provider:', error);
      throw error;
    }
  }

  async createLoginRequest(providerId: string, relayState?: string): Promise<string> {
    const sp = this.providers.get(providerId);
    if (!sp) {
      throw new Error(`SAML provider not found: ${providerId}`);
    }

    const idpConfig = await redis.get(`saml:idp:${providerId}`);
    if (!idpConfig) {
      throw new Error(`IDP configuration not found: ${providerId}`);
    }

    const idp = new saml2.IdentityProvider(JSON.parse(idpConfig));

    return new Promise((resolve, reject) => {
      sp.create_login_request_url(idp, { relay_state: relayState }, (err, loginUrl) => {
        if (err) {
          logger.error('Failed to create SAML login URL:', err);
          reject(err);
        } else {
          resolve(loginUrl);
        }
      });
    });
  }

  async validateAssertion(
    providerId: string,
    samlResponse: string
  ): Promise<{ email: string; name: string; attributes: Record<string, any> }> {
    const sp = this.providers.get(providerId);
    if (!sp) {
      throw new Error(`SAML provider not found: ${providerId}`);
    }

    const idpConfig = await redis.get(`saml:idp:${providerId}`);
    if (!idpConfig) {
      throw new Error(`IDP configuration not found: ${providerId}`);
    }

    const idp = new saml2.IdentityProvider(JSON.parse(idpConfig));

    return new Promise((resolve, reject) => {
      sp.post_assert(idp, { request_body: { SAMLResponse: samlResponse } }, (err, response) => {
        if (err) {
          logger.error('SAML assertion validation failed:', err);
          reject(err);
        } else {
          const user = response.user;
          resolve({
            email: user.email || user.name_id,
            name: user.attributes?.displayName || user.name_id,
            attributes: user.attributes || {},
          });
        }
      });
    });
  }

  async createMetadata(providerId: string): Promise<string> {
    const sp = this.providers.get(providerId);
    if (!sp) {
      throw new Error(`SAML provider not found: ${providerId}`);
    }

    return sp.create_metadata();
  }

  // Organization-specific SAML providers
  async getOrganizationProviders(organizationId: string): Promise<SAMLProvider[]> {
    const keys = await redis.keys(`saml:org:${organizationId}:*`);
    const providers: SAMLProvider[] = [];

    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        providers.push(JSON.parse(data));
      }
    }

    return providers;
  }

  async saveOrganizationProvider(provider: SAMLProvider): Promise<void> {
    await redis.set(
      `saml:org:${provider.organizationId}:${provider.id}`,
      JSON.stringify(provider),
      'EX',
      86400 * 90 // 90 days
    );
    
    if (provider.enabled) {
      await this.initializeProvider(provider);
    }
  }

  // Common IDP presets
  static getIDPPresets() {
    return {
      okta: {
        name: 'Okta',
        idpSsoUrl: 'https://{yourOktaDomain}/app/{appId}/sso/saml',
        metadataUrl: 'https://{yourOktaDomain}/app/{appId}/sso/saml/metadata',
      },
      azure: {
        name: 'Azure AD',
        idpSsoUrl: 'https://login.microsoftonline.com/{tenantId}/saml2',
        metadataUrl: 'https://login.microsoftonline.com/{tenantId}/federationmetadata/2007-06/federationmetadata.xml',
      },
      google: {
        name: 'Google Workspace',
        idpSsoUrl: 'https://accounts.google.com/o/saml2/idp?idpid={idpId}',
        metadataUrl: 'https://accounts.google.com/o/saml2/metadata?idpid={idpId}',
      },
      onelogin: {
        name: 'OneLogin',
        idpSsoUrl: 'https://{subdomain}.onelogin.com/trust/saml2/http-post/sso/{appId}',
        metadataUrl: 'https://{subdomain}.onelogin.com/saml/metadata/{appId}',
      },
    };
  }
}

// Fastify plugin for SAML routes
export async function samlRoutes(fastify: FastifyInstance) {
  const samlService = new SAMLService(fastify.authManager);

  // Initiate SAML login
  fastify.get('/api/auth/saml/:providerId/login', async (request, reply) => {
    const { providerId } = request.params as { providerId: string };
    const { RelayState } = request.query as { RelayState?: string };

    try {
      const loginUrl = await samlService.createLoginRequest(providerId, RelayState);
      reply.redirect(loginUrl);
    } catch (error) {
      logger.error('SAML login initiation failed:', error);
      reply.code(500).send({ error: 'Failed to initiate SAML login' });
    }
  });

  // SAML assertion consumer service
  fastify.post('/api/auth/saml/:providerId/acs', async (request, reply) => {
    const { providerId } = request.params as { providerId: string };
    const { SAMLResponse, RelayState } = request.body as {
      SAMLResponse: string;
      RelayState?: string;
    };

    try {
      const userData = await samlService.validateAssertion(providerId, SAMLResponse);
      
      // Create or update user
      const { token, identity } = await fastify.authManager.loginSSO({
        email: userData.email,
        name: userData.name,
        provider: 'saml',
        providerId,
        attributes: userData.attributes,
      });

      // Redirect to app with token
      const redirectUrl = RelayState || '/';
      reply.redirect(`${redirectUrl}?token=${token}`);
    } catch (error) {
      logger.error('SAML assertion validation failed:', error);
      reply.code(401).send({ error: 'SAML authentication failed' });
    }
  });

  // Get SAML metadata
  fastify.get('/api/auth/saml/:providerId/metadata', async (request, reply) => {
    const { providerId } = request.params as { providerId: string };

    try {
      const metadata = await samlService.createMetadata(providerId);
      reply.type('application/xml').send(metadata);
    } catch (error) {
      logger.error('Failed to generate SAML metadata:', error);
      reply.code(500).send({ error: 'Failed to generate metadata' });
    }
  });

  // Admin: Configure SAML provider
  fastify.post(
    '/api/admin/saml/providers',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const provider = request.body as SAMLProvider;

      // Check admin permissions
      if (!request.user?.roles?.includes('admin')) {
        return reply.code(403).send({ error: 'Admin access required' });
      }

      try {
        await samlService.saveOrganizationProvider(provider);
        reply.send({ success: true, providerId: provider.id });
      } catch (error) {
        logger.error('Failed to save SAML provider:', error);
        reply.code(500).send({ error: 'Failed to save provider configuration' });
      }
    }
  );

  // Get organization's SAML providers
  fastify.get(
    '/api/admin/saml/providers',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      if (!request.user?.organizationId) {
        return reply.code(400).send({ error: 'Organization context required' });
      }

      try {
        const providers = await samlService.getOrganizationProviders(
          request.user.organizationId
        );
        reply.send({ providers });
      } catch (error) {
        logger.error('Failed to get SAML providers:', error);
        reply.code(500).send({ error: 'Failed to retrieve providers' });
      }
    }
  );

  fastify.decorate('samlService', samlService);
}