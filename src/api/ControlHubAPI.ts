import axios, { AxiosInstance } from 'axios';
import * as vscode from 'vscode';
import { Pipeline, PipelineEvent, PipelineMetrics } from '../models/Pipeline';

export class ControlHubAPI {
    private client: AxiosInstance;
    private baseURL: string;

    constructor() {
        // Get base URL from settings or use default
        const config = vscode.workspace.getConfiguration('thinkube-cicd');
        this.baseURL = config.get('apiUrl', 'https://control.thinkube.com');
        
        this.client = axios.create({
            baseURL: `${this.baseURL}/api/v1/cicd`,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // Add auth token if available
        this.setupAuthInterceptor();
    }

    private setupAuthInterceptor() {
        this.client.interceptors.request.use(
            async (config) => {
                // Try to get auth token from thinkube-control
                try {
                    const token = await this.getAuthToken();
                    if (token) {
                        config.headers.Authorization = `Bearer ${token}`;
                    }
                } catch (error) {
                    console.warn('Could not get auth token:', error);
                }
                return config;
            },
            (error) => {
                return Promise.reject(error);
            }
        );
    }

    private async getAuthToken(): Promise<string | null> {
        // This would integrate with Keycloak through thinkube-control
        // For now, return null to use anonymous access
        return null;
    }

    async listPipelines(appName?: string, status?: string, limit: number = 20): Promise<Pipeline[]> {
        try {
            const response = await this.client.get('/pipelines', {
                params: { app_name: appName, status, limit }
            });
            return response.data;
        } catch (error) {
            console.error('Failed to list pipelines:', error);
            throw error;
        }
    }

    async getPipeline(pipelineId: string): Promise<Pipeline | null> {
        try {
            const response = await this.client.get(`/pipelines/${pipelineId}`);
            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                return null;
            }
            console.error('Failed to get pipeline:', error);
            throw error;
        }
    }

    async getPipelineEvents(pipelineId: string, eventType?: string): Promise<PipelineEvent[]> {
        try {
            const response = await this.client.get(`/pipelines/${pipelineId}/events`, {
                params: { event_type: eventType }
            });
            return response.data;
        } catch (error) {
            console.error('Failed to get pipeline events:', error);
            throw error;
        }
    }

    async createEvent(event: PipelineEvent): Promise<void> {
        try {
            await this.client.post('/events', event);
        } catch (error) {
            console.error('Failed to create event:', error);
            throw error;
        }
    }

    async getMetrics(appName: string, period: string = '7d'): Promise<PipelineMetrics> {
        try {
            const response = await this.client.get('/metrics', {
                params: { app_name: appName, period }
            });
            return response.data.metrics;
        } catch (error) {
            console.error('Failed to get metrics:', error);
            throw error;
        }
    }

    async listApplications(): Promise<string[]> {
        try {
            const response = await this.client.get('/applications');
            return response.data;
        } catch (error) {
            console.error('Failed to list applications:', error);
            throw error;
        }
    }

    connectWebSocket(pipelineId: string, onMessage: (event: PipelineEvent) => void): WebSocket {
        const wsUrl = this.baseURL.replace(/^https?/, 'ws') + `/api/v1/cicd/ws/pipelines/${pipelineId}`;
        const ws = new WebSocket(wsUrl);

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                onMessage(data);
            } catch (error) {
                console.error('Failed to parse WebSocket message:', error);
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        return ws;
    }

    async testConnection(): Promise<boolean> {
        try {
            await this.client.get('/applications');
            return true;
        } catch (error) {
            return false;
        }
    }
}

// 🤖 Generated with Claude