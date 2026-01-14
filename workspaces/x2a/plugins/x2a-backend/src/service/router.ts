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
import express from 'express';
import Router from 'express-promise-router';
import type {
  PodsListResponse,
  X2AErrorResponse,
  JobCreateRequest,
  JobCreateResponse,
} from '@red-hat-developer-hub/backstage-plugin-x2a-common';
import { KubernetesService } from './KubernetesService';
import { JobsService } from './JobsService';

export interface RouterOptions {
  logger: LoggerService;
  config: Config;
}

/**
 * Creates the Express router for the X2A backend plugin
 */
export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger, config } = options;

  const k8sService = new KubernetesService(config, logger);
  const jobsService = new JobsService(config, logger);

  const router = Router();
  router.use(express.json());

  // Health check endpoint
  router.get('/health', (_, response) => {
    logger.info('Health check');
    response.json({ status: 'ok' });
  });

  // Get current Kubernetes context
  router.get('/context', (_, response) => {
    try {
      const context = k8sService.getCurrentContext();
      response.json({ context });
    } catch (error: any) {
      logger.error(`Error getting context: ${error.message}`);
      const errorResponse: X2AErrorResponse = {
        error: 'Failed to get Kubernetes context',
        details: error.message,
      };
      response.status(500).json(errorResponse);
    }
  });

  // List pods in a namespace
  router.get('/pods/:namespace', async (request, response) => {
    const { namespace } = request.params;

    if (!namespace) {
      const errorResponse: X2AErrorResponse = {
        error: 'Namespace parameter is required',
      };
      return response.status(400).json(errorResponse);
    }

    try {
      logger.info(`Listing pods in namespace: ${namespace}`);
      const pods = await k8sService.listPodsInNamespace(namespace);

      const responseData: PodsListResponse = {
        pods,
        namespace,
        total: pods.length,
      };

      return response.json(responseData);
    } catch (error: any) {
      logger.error(
        `Error listing pods in namespace ${namespace}: ${error.message}`,
      );

      const statusCode = error.message.includes('not found')
        ? 404
        : error.message.includes('Permission denied')
          ? 403
          : 500;

      const errorResponse: X2AErrorResponse = {
        error: `Failed to list pods in namespace '${namespace}'`,
        details: error.message,
      };

      return response.status(statusCode).json(errorResponse);
    }
  });

  // Create a migration job
  router.post('/jobs', async (request, response) => {
    try {
      const jobRequest: JobCreateRequest = request.body;

      // Validate required fields
      if (!jobRequest.phase || !jobRequest.name || !jobRequest.description) {
        const errorResponse: X2AErrorResponse = {
          error: 'Missing required fields: phase, name, description',
        };
        return response.status(400).json(errorResponse);
      }

      logger.info(`Creating ${jobRequest.phase} job: ${jobRequest.name}`);

      const jobName = await jobsService.createJob(jobRequest);

      const jobResponse: JobCreateResponse = {
        jobName,
        namespace: 'x2a',
        phase: jobRequest.phase,
        created: true,
      };

      return response.status(201).json(jobResponse);
    } catch (error: any) {
      logger.error(`Error creating job: ${error.message}`);

      const errorResponse: X2AErrorResponse = {
        error: 'Failed to create job',
        details: error.message,
      };

      return response.status(500).json(errorResponse);
    }
  });

  return router;
}
