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
import type { PodInfo } from '@red-hat-developer-hub/backstage-plugin-x2a-common';

/**
 * Service for interacting with Kubernetes clusters
 */
export class KubernetesService {
  private readonly kc: k8s.KubeConfig;
  private readonly k8sApi: k8s.CoreV1Api;

  constructor(
    _config: Config,
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

    this.k8sApi = this.kc.makeApiClient(k8s.CoreV1Api);
  }

  /**
   * List all pods in a given namespace
   */
  async listPodsInNamespace(namespace: string): Promise<PodInfo[]> {
    try {
      this.logger.info(`Fetching pods from namespace: ${namespace}`);

      const response = await this.k8sApi.listNamespacedPod(namespace);

      const pods: PodInfo[] = response.body.items.map(pod => ({
        name: pod.metadata?.name || 'unknown',
        namespace: pod.metadata?.namespace || namespace,
        status: pod.status?.phase || 'Unknown',
        createdAt: pod.metadata?.creationTimestamp?.toISOString(),
        labels: pod.metadata?.labels,
        containerCount: pod.spec?.containers?.length || 0,
      }));

      this.logger.info(
        `Found ${pods.length} pods in namespace ${namespace}`,
      );

      return pods;
    } catch (error: any) {
      this.logger.error(
        `Error listing pods in namespace ${namespace}: ${error.message}`,
      );

      if (error.response?.statusCode === 404) {
        throw new Error(`Namespace '${namespace}' not found`);
      }
      if (error.response?.statusCode === 403) {
        throw new Error(
          `Permission denied to list pods in namespace '${namespace}'`,
        );
      }

      throw new Error(
        `Failed to list pods in namespace '${namespace}': ${error.message}`,
      );
    }
  }

  /**
   * Get information about the current Kubernetes context
   */
  getCurrentContext(): string {
    return this.kc.getCurrentContext();
  }
}
