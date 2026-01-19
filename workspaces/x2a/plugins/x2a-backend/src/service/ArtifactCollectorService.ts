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

import { LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import * as fs from 'fs';
import * as path from 'path';
import type { CollectArtifactsRequest } from '@red-hat-developer-hub/backstage-plugin-x2a-common';

/**
 * Service for collecting and persisting job artifacts
 *
 * This service handles the callback from completed jobs to store
 * artifact information. Initially writes to a JSON Lines file,
 * will be extended to write to database in future iterations.
 */
export class ArtifactCollectorService {
  private readonly artifactsFile: string;

  constructor(
    config: Config,
    private readonly logger: LoggerService,
  ) {
    // Configure artifacts file path from config or use default
    const artifactsPath = config.getOptionalString('x2a.artifactsPath') || '/tmp';
    this.artifactsFile = path.join(artifactsPath, 'x2a-artifacts.jsonl');

    this.logger.info(`ArtifactCollectorService initialized: file=${this.artifactsFile}`);
  }

  /**
   * Collect and persist artifacts from a completed job
   *
   * @param request - Artifact collection request from job callback
   */
  async collectArtifacts(request: CollectArtifactsRequest): Promise<void> {
    this.logger.info(
      `Collecting artifacts for job: ${request.jobName}, phase: ${request.phase}, status: ${request.status}`,
    );

    // Add server-side timestamp if not provided
    const enrichedRequest = {
      ...request,
      timestamp: request.timestamp || new Date().toISOString(),
      collectedAt: new Date().toISOString(),
    };

    try {
      // Append to JSON Lines file (one JSON object per line)
      const jsonLine = JSON.stringify(enrichedRequest) + '\n';

      await fs.promises.appendFile(this.artifactsFile, jsonLine, 'utf8');

      this.logger.info(
        `Successfully collected artifacts for job ${request.jobName}`,
      );

      // Log detailed information based on phase
      this.logArtifactDetails(enrichedRequest);
    } catch (error: any) {
      this.logger.error(
        `Failed to collect artifacts for job ${request.jobName}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Log detailed artifact information based on phase
   */
  private logArtifactDetails(request: CollectArtifactsRequest): void {
    const { phase, artifactReferences, substatus } = request;

    if (substatus) {
      this.logger.info(
        `Job substatus: ${substatus.key}${substatus.message ? ` - ${substatus.message}` : ''}`,
      );
    }

    if (artifactReferences) {
      switch (phase) {
        case 'init':
          if (artifactReferences.migrationPlan) {
            this.logger.info(`Migration plan: ${artifactReferences.migrationPlan}`);
          }
          break;

        case 'analyze':
          if (artifactReferences.moduleMigrationPlan) {
            this.logger.info(`Module migration plan: ${artifactReferences.moduleMigrationPlan}`);
          }
          break;

        case 'migrate':
          if (artifactReferences.ansibleSources) {
            this.logger.info(`Ansible sources: ${artifactReferences.ansibleSources}`);
          }
          break;

        case 'publish':
          if (artifactReferences.gitopsRepo) {
            this.logger.info(`GitOps repository: ${artifactReferences.gitopsRepo}`);
          }
          break;
      }
    }
  }

  /**
   * Read all collected artifacts (for debugging/testing)
   *
   * @returns Array of all collected artifact requests
   */
  async getArtifacts(): Promise<CollectArtifactsRequest[]> {
    try {
      const content = await fs.promises.readFile(this.artifactsFile, 'utf8');

      // Parse JSON Lines format
      const lines = content.trim().split('\n').filter(line => line.length > 0);
      return lines.map(line => JSON.parse(line));
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet, return empty array
        return [];
      }

      this.logger.error(`Failed to read artifacts file: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get artifacts for a specific job
   *
   * @param jobName - Name of the job to get artifacts for
   * @returns Artifact request for the specified job, or undefined if not found
   */
  async getArtifactsByJobName(jobName: string): Promise<CollectArtifactsRequest | undefined> {
    const artifacts = await this.getArtifacts();
    return artifacts.find(artifact => artifact.jobName === jobName);
  }

  /**
   * Clear all collected artifacts (for testing)
   */
  async clearArtifacts(): Promise<void> {
    try {
      await fs.promises.unlink(this.artifactsFile);
      this.logger.info('Cleared all artifacts');
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        this.logger.error(`Failed to clear artifacts: ${error.message}`);
        throw error;
      }
      // File doesn't exist, nothing to clear
    }
  }
}
