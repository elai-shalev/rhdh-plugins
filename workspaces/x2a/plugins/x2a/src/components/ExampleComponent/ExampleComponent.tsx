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

import React from 'react';
import { Typography, Grid } from '@material-ui/core';
import {
  InfoCard,
  Header,
  Page,
  Content,
} from '@backstage/core-components';

export const ExampleComponent = () => (
  <Page themeId="tool">
    <Header title="Welcome to X2A!" subtitle="Kubernetes Integration Plugin" />
    <Content>
      <Grid container spacing={3} direction="column">
        <Grid item>
          <InfoCard title="Getting Started">
            <Typography variant="body1">
              This is a placeholder for the X2A frontend plugin.
              The backend plugin provides REST API endpoints for Kubernetes cluster access.
            </Typography>
            <Typography variant="body2" style={{ marginTop: 16 }}>
              Available API endpoints:
            </Typography>
            <ul>
              <li>
                <code>GET /api/x2a/health</code> - Health check
              </li>
              <li>
                <code>GET /api/x2a/context</code> - Get Kubernetes context
              </li>
              <li>
                <code>GET /api/x2a/pods/:namespace</code> - List pods in namespace
              </li>
            </ul>
          </InfoCard>
        </Grid>
      </Grid>
    </Content>
  </Page>
);
