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

/**
 * Represents basic information about a Kubernetes pod
 */
export interface PodInfo {
  /**
   * Name of the pod
   */
  name: string;

  /**
   * Namespace where the pod is located
   */
  namespace: string;

  /**
   * Current phase of the pod (Running, Pending, Failed, etc.)
   */
  status: string;

  /**
   * Pod creation timestamp
   */
  createdAt?: string;

  /**
   * Pod labels
   */
  labels?: Record<string, string>;

  /**
   * Number of containers in the pod
   */
  containerCount?: number;
}

/**
 * Response from the pods listing endpoint
 */
export interface PodsListResponse {
  /**
   * List of pods
   */
  pods: PodInfo[];

  /**
   * Namespace that was queried
   */
  namespace: string;

  /**
   * Total number of pods returned
   */
  total: number;
}

/**
 * Error response from the API
 */
export interface X2AErrorResponse {
  /**
   * Error message
   */
  error: string;

  /**
   * Additional error details
   */
  details?: string;
}

/**
 * Migration phase types for x2a-convertor workflow
 */
export type MigrationPhase = 'init' | 'analyze' | 'migrate' | 'publish';

/**
 * Request to create a migration job
 */
export interface JobCreateRequest {
  /**
   * Migration phase to execute
   */
  phase: MigrationPhase;

  /**
   * Name for the migration job
   */
  name: string;

  /**
   * Description of what this job will do
   */
  description: string;

  /**
   * Module/cookbook name (for analyze, migrate, publish phases)
   */
  moduleName?: string;

  /**
   * Source technology being migrated from (for migrate phase)
   */
  sourceTechnology?: string;

  /**
   * GitHub owner for publishing (for publish phase)
   */
  githubOwner?: string;

  /**
   * GitHub branch for publishing (for publish phase, default: 'test_test_1')
   */
  githubBranch?: string;

  /**
   * Skip git operations (for publish phase)
   */
  skipGit?: boolean;

  /**
   * Base path for deployment (for publish phase)
   */
  basePath?: string;

  /**
   * Path to collections YAML file (for publish phase)
   */
  collectionsFile?: string;

  /**
   * Path to inventory YAML file (for publish phase)
   */
  inventoryFile?: string;

  /**
   * Source role paths (for publish phase)
   */
  sourcePaths?: string[];
}

/**
 * Response from creating a job
 */
export interface JobCreateResponse {
  /**
   * Name of the created Kubernetes job
   */
  jobName: string;

  /**
   * Namespace where the job was created
   */
  namespace: string;

  /**
   * Migration phase of the job
   */
  phase: MigrationPhase;

  /**
   * Whether the job was successfully created
   */
  created: boolean;
}

/**
 * Artifact references for different migration phases
 */
export interface ArtifactReferences {
  /**
   * Path to migration plan file (for init phase)
   */
  migrationPlan?: string;

  /**
   * Path to module migration plan file (for analyze phase)
   */
  moduleMigrationPlan?: string;

  /**
   * Path to Ansible sources (for migrate phase)
   */
  ansibleSources?: string;

  /**
   * GitOps repository URL (for publish phase)
   */
  gitopsRepo?: string;
}

/**
 * Substatus information for job completion
 */
export interface Substatus {
  /**
   * Status key identifier
   */
  key: string;

  /**
   * Optional status message
   */
  message?: string;
}

/**
 * Request to collect artifacts after job completion
 */
export interface CollectArtifactsRequest {
  /**
   * Name of the completed Kubernetes job
   */
  jobName: string;

  /**
   * Migration phase that was executed
   */
  phase: MigrationPhase;

  /**
   * Job completion status
   */
  status: 'success' | 'failure';

  /**
   * Optional detailed substatus
   */
  substatus?: Substatus;

  /**
   * Migration identifier (optional)
   */
  migrationId?: string;

  /**
   * Module identifier (not used for init phase)
   */
  moduleId?: string;

  /**
   * References to artifacts created by the job
   */
  artifactReferences?: ArtifactReferences;

  /**
   * Timestamp when the job completed
   */
  timestamp?: string;

  /**
   * Optional job logs or additional data
   */
  metadata?: Record<string, any>;
}

/**
 * Response from collecting artifacts
 */
export interface CollectArtifactsResponse {
  /**
   * Whether the artifacts were successfully collected
   */
  success: boolean;

  /**
   * Message describing the result
   */
  message: string;

  /**
   * Timestamp when artifacts were collected
   */
  collectedAt: string;
}
