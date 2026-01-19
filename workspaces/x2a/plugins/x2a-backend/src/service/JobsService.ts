/*
 * Copyright Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Config } from '@backstage/config';
import { LoggerService } from '@backstage/backend-plugin-api';
import * as k8s from '@kubernetes/client-node';
import type {
  MigrationPhase,
  JobCreateRequest,
} from '@red-hat-developer-hub/backstage-plugin-x2a-common';

/**
 * Service for managing Kubernetes Jobs for x2a migration phases
 */
export class JobsService {
  private readonly kc: k8s.KubeConfig;
  private readonly batchApi: k8s.BatchV1Api;
  private readonly namespace: string;
  private readonly image: string;

  private readonly callbackUrl: string;
  private readonly callbackSecret?: string;

  constructor(
    config: Config,
    private readonly logger: LoggerService,
  ) {
    this.kc = new k8s.KubeConfig();

    // Load Kubernetes config from default locations
    // This will check KUBECONFIG env var, ~/.kube/config, or ~/.kube/kubeconfig, or in-cluster config
    try {
      // Try to set KUBECONFIG to ~/.kube/kubeconfig if not already set
      if (!process.env.KUBECONFIG) {
        const path = require('path');
        const os = require('os');
        const kubeconfigPath = path.join(os.homedir(), '.kube', 'kubeconfig');
        const fs = require('fs');

        // Check if ~/.kube/kubeconfig exists
        if (fs.existsSync(kubeconfigPath)) {
          process.env.KUBECONFIG = kubeconfigPath;
          this.logger.info(`Setting KUBECONFIG to ${kubeconfigPath}`);
        }
      }

      this.kc.loadFromDefault();
      this.logger.info(`Loaded Kubernetes configuration from ${process.env.KUBECONFIG || 'default location'}`);
    } catch (error) {
      this.logger.warn(
        `Failed to load default Kubernetes config: ${error}. Will attempt to use cluster config.`,
      );
      try {
        this.kc.loadFromCluster();
        this.logger.info('Loaded in-cluster Kubernetes configuration');
      } catch (clusterError) {
        this.logger.error(
          `Failed to load Kubernetes configuration: ${clusterError}`,
        );
        throw new Error(
          'Unable to load Kubernetes configuration. Please ensure KUBECONFIG is set or running in a cluster.',
        );
      }
    }

    this.batchApi = this.kc.makeApiClient(k8s.BatchV1Api);

    // Configuration
    this.namespace = config.getOptionalString('x2a.namespace') || 'rhdh';
    this.image = 'quay.io/x2ansible/x2a-convertor:latest';

    // Callback configuration
    const backendUrl = config.getOptionalString('backend.baseUrl') || 'http://localhost:7007';
    this.callbackUrl = `${backendUrl}/x2a/collectArtifacts`;
    this.callbackSecret = config.getOptionalString('x2a.callbackSecret');

    this.logger.info(
      `JobsService initialized: namespace=${this.namespace}, image=${this.image}, callbackUrl=${this.callbackUrl}`,
    );
  }

  /**
   * Create a Kubernetes Job for a migration phase
   */
  async createJob(request: JobCreateRequest): Promise<string> {
    const jobName = this.generateJobName(request.phase, request.name);
    const command = this.buildCommand(request);

    const job: k8s.V1Job = {
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: {
        name: jobName,
        namespace: this.namespace,
        labels: {
          app: 'x2a-convertor',
          phase: request.phase,
        },
        annotations: {
          description: request.description,
        },
      },
      spec: {
        backoffLimit: 1,
        template: {
          spec: {
            restartPolicy: 'Never',
            containers: [
              {
                name: 'x2a-convertor',
                image: this.image,
                command: ['/bin/sh', '-c'],
                args: [command],
                env: [
                  // System Configuration
                  {
                    name: 'HOME',
                    value: '/tmp',
                  },
                  {
                    name: 'UV_CACHE_DIR',
                    value: '/tmp/.uv-cache',
                  },
                  // Callback Configuration
                  {
                    name: 'CALLBACK_URL',
                    value: this.callbackUrl,
                  },
                  {
                    name: 'CALLBACK_SECRET',
                    value: this.callbackSecret || '',
                  },
                  {
                    name: 'JOB_NAME',
                    value: jobName,
                  },
                  {
                    name: 'MIGRATION_PHASE',
                    value: request.phase,
                  },
                  // LLM Configuration
                  {
                    name: 'LLM_MODEL',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'x2a-secrets',
                        key: 'llm-model',
                      },
                    },
                  },
                  {
                    name: 'OPENAI_API_BASE',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'x2a-secrets',
                        key: 'openai-api-base',
                      },
                    },
                  },
                  {
                    name: 'VERTEXAI_PROJECT',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'x2a-secrets',
                        key: 'vertexai-project',
                      },
                    },
                  },
                  {
                    name: 'OPENAI_API_KEY',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'x2a-secrets',
                        key: 'openai-api-key',
                      },
                    },
                  },
                  {
                    name: 'LOG_LEVEL',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'x2a-secrets',
                        key: 'log-level',
                      },
                    },
                  },
                  {
                    name: 'LANGCHAIN_DEBUG',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'x2a-secrets',
                        key: 'langchain-debug',
                      },
                    },
                  },
                  {
                    name: 'RECURSION_LIMIT',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'x2a-secrets',
                        key: 'recursion-limit',
                      },
                    },
                  },
                  {
                    name: 'MAX_EXPORT_ATTEMPTS',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'x2a-secrets',
                        key: 'max-export-attempts',
                      },
                    },
                  },
                  // GitHub Configuration
                  {
                    name: 'GITHUB_TOKEN',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'x2a-secrets',
                        key: 'github-token',
                        optional: true,
                      },
                    },
                  },
                  // AAP Configuration
                  {
                    name: 'AAP_CONTROLLER_URL',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'x2a-secrets',
                        key: 'aap-controller-url',
                      },
                    },
                  },
                  {
                    name: 'AAP_ORG_NAME',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'x2a-secrets',
                        key: 'aap-org-name',
                      },
                    },
                  },
                  {
                    name: 'AAP_USERNAME',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'x2a-secrets',
                        key: 'aap-username',
                      },
                    },
                  },
                  {
                    name: 'AAP_PASSWORD',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'x2a-secrets',
                        key: 'aap-password',
                      },
                    },
                  },
                  {
                    name: 'AAP_OAUTH_TOKEN',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'x2a-secrets',
                        key: 'aap-oauth-token',
                        optional: true,
                      },
                    },
                  },
                  {
                    name: 'AAP_CA_BUNDLE',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'x2a-secrets',
                        key: 'aap-ca-bundle',
                        optional: true,
                      },
                    },
                  },
                  {
                    name: 'AAP_VERIFY_SSL',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'x2a-secrets',
                        key: 'aap-verify-ssl',
                      },
                    },
                  },
                  // Git Configuration (for publish phase)
                  {
                    name: 'GIT_AUTHOR_NAME',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'x2a-secrets',
                        key: 'git-author-name',
                      },
                    },
                  },
                  {
                    name: 'GIT_AUTHOR_EMAIL',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'x2a-secrets',
                        key: 'git-author-email',
                      },
                    },
                  },
                  {
                    name: 'GIT_COMMITTER_NAME',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'x2a-secrets',
                        key: 'git-author-name',
                      },
                    },
                  },
                  {
                    name: 'GIT_COMMITTER_EMAIL',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'x2a-secrets',
                        key: 'git-author-email',
                      },
                    },
                  },
                ],
                volumeMounts: [
                  {
                    name: 'source',
                    mountPath: '/app/source',
                  },
                ],
              },
            ],
            volumes: [
              {
                name: 'source',
                persistentVolumeClaim: {
                  claimName: 'x2a-source-pvc',
                },
              },
            ],
          },
        },
      },
    };

    this.logger.info(`Creating job: ${jobName} for phase: ${request.phase}`);

    await this.batchApi.createNamespacedJob(this.namespace, job);

    this.logger.info(`Successfully created job: ${jobName}`);

    return jobName;
  }

  /**
   * Generate a unique job name
   */
  private generateJobName(phase: MigrationPhase, name: string): string {
    const timestamp = Date.now().toString(36);
    const clean = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    // K8s names must be <= 63 characters
    return `x2a-${phase}-${clean}-${timestamp}`.substring(0, 63);
  }

  /**
   * Wrap a command with callback logic
   * This wrapper executes the actual command, then calls the callback endpoint
   * with job results regardless of success or failure
   */
  private wrapCommandWithCallback(actualCommand: string): string {
    // Build callback payload with proper JSON escaping
    const callbackScript = `
# Execute the actual migration command
${actualCommand}
EXIT_CODE=$?

# Determine status based on exit code
if [ $EXIT_CODE -eq 0 ]; then
  STATUS="success"
else
  STATUS="failure"
fi

# Build callback payload
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
CALLBACK_PAYLOAD=$(cat <<EOF
{
  "jobName": "$JOB_NAME",
  "phase": "$MIGRATION_PHASE",
  "status": "$STATUS",
  "timestamp": "$TIMESTAMP"
}
EOF
)

# Call callback endpoint (ignore failures to avoid masking original exit code)
if [ -n "$CALLBACK_URL" ]; then
  echo "Calling callback: $CALLBACK_URL"
  if [ -n "$CALLBACK_SECRET" ]; then
    curl -X POST "$CALLBACK_URL" \\
      -H "Content-Type: application/json" \\
      -H "X-Callback-Secret: $CALLBACK_SECRET" \\
      -d "$CALLBACK_PAYLOAD" \\
      --max-time 10 \\
      --silent \\
      --show-error || echo "Warning: Callback failed but continuing..."
  else
    curl -X POST "$CALLBACK_URL" \\
      -H "Content-Type: application/json" \\
      -d "$CALLBACK_PAYLOAD" \\
      --max-time 10 \\
      --silent \\
      --show-error || echo "Warning: Callback failed but continuing..."
  fi
fi

# Exit with the original command's exit code
exit $EXIT_CODE
`;

    return callbackScript.trim();
  }

  /**
   * Build the command for the migration phase
   */
  private buildCommand(req: JobCreateRequest): string {
    const cmd = 'uv run python app.py';
    const dir = '/app/source';

    let actualCommand: string;

    switch (req.phase) {
      case 'init':
        actualCommand = `${cmd} init --source-dir ${dir} "${req.description}"`;
        break;

      case 'analyze':
        actualCommand = `${cmd} analyze "${req.description}" --source-dir ${dir}`;
        break;

      case 'migrate':
        actualCommand = `${cmd} migrate --source-dir ${dir} --source-technology ${req.sourceTechnology || 'Chef'} --high-level-migration-plan migration-plan.md --module-migration-plan migration-plan-${req.moduleName}.md "Convert ${req.moduleName}"`;
        break;

      case 'publish': {
        const sourcePaths = req.sourcePaths?.join(' --source-paths ') || `${dir}/ansible/roles/${req.moduleName}`;
        const githubBranch = req.githubBranch || 'test_test_1';
        let publishCmd = `${cmd} publish "${req.moduleName}" --source-paths ${sourcePaths} --github-owner ${req.githubOwner} --github-branch ${githubBranch}`;

        if (req.skipGit) {
          publishCmd += ' --skip-git';
        }
        if (req.basePath) {
          publishCmd += ` --base-path ${req.basePath}`;
        }
        if (req.collectionsFile) {
          publishCmd += ` --collections-file ${req.collectionsFile}`;
        }
        if (req.inventoryFile) {
          publishCmd += ` --inventory-file ${req.inventoryFile}`;
        }

        // Workaround: Configure git to use GITHUB_TOKEN for HTTPS authentication
        // This rewrites all https://github.com/ URLs to include the token
        // Format: https://${GITHUB_TOKEN}@github.com/
        const gitSetup = 'git config --global url."https://${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"';

        actualCommand = `${gitSetup} && ${publishCmd}`;
        break;
      }

      default:
        throw new Error(`Unknown phase: ${req.phase}`);
    }

    // Wrap the command with callback logic
    return this.wrapCommandWithCallback(actualCommand);
  }
}
