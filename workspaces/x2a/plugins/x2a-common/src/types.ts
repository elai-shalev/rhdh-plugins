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
