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
    this.namespace = config.getOptionalString('x2a.namespace') || 'x2a';
    this.image = 'quay.io/x2ansible/x2a-convertor:latest';

    this.logger.info(
      `JobsService initialized: namespace=${this.namespace}, image=${this.image}`,
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
                  {
                    name: 'LLM_MODEL',
                    value: 'anthropic.claude-3-7-sonnet-20250219-v1:0',
                  },
                  {
                    name: 'AWS_REGION',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'x2a-secrets',
                        key: 'aws-region',
                      },
                    },
                  },
                  {
                    name: 'AWS_BEARER_TOKEN_BEDROCK',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'x2a-secrets',
                        key: 'aws-bearer-token',
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
   * Build the command for the migration phase
   */
  private buildCommand(req: JobCreateRequest): string {
    const cmd = 'python -m app';
    const dir = '/app/source';

    switch (req.phase) {
      case 'init':
        return `${cmd} init --source-dir ${dir} "${req.description}"`;

      case 'analyze':
        return `${cmd} analyze "${req.description}" --source-dir ${dir}`;

      case 'migrate':
        return `${cmd} migrate --source-dir ${dir} --source-technology ${req.sourceTechnology || 'Chef'} --high-level-migration-plan migration-plan.md --module-migration-plan migration-plan-${req.moduleName}.md "Convert ${req.moduleName}"`;

      case 'publish':
        return `${cmd} publish "${req.moduleName}" --source-paths ${dir}/ansible/roles/${req.moduleName} --github-owner ${req.githubOwner} --github-branch main`;

      default:
        throw new Error(`Unknown phase: ${req.phase}`);
    }
  }
}
