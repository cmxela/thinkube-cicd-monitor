import * as k8s from '@kubernetes/client-node';
import * as vscode from 'vscode';

export class K8sClient {
    private kc: k8s.KubeConfig;
    private coreApi!: k8s.CoreV1Api;
    private appsApi!: k8s.AppsV1Api;

    constructor() {
        this.kc = new k8s.KubeConfig();
        
        // Try to load from configured path or default locations
        const kubeconfigPath = vscode.workspace.getConfiguration('thinkube-cicd').get<string>('kubeconfig');
        
        try {
            if (kubeconfigPath && kubeconfigPath.trim()) {
                console.log('Loading kubeconfig from:', kubeconfigPath);
                this.kc.loadFromFile(kubeconfigPath);
            } else if (process.env.KUBERNETES_SERVICE_HOST) {
                // In-cluster config
                console.log('Using in-cluster Kubernetes configuration');
                this.kc.loadFromCluster();
            } else {
                // Default config
                console.log('Loading default kubeconfig');
                this.kc.loadFromDefault();
            }
            
            this.coreApi = this.kc.makeApiClient(k8s.CoreV1Api);
            this.appsApi = this.kc.makeApiClient(k8s.AppsV1Api);
            console.log('Kubernetes client initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Kubernetes client:', error);
            // Don't show error immediately - might be a configuration issue
            // User can use Configure command to fix it
        }
    }

    async getConfigMaps(namespace: string, labelSelector?: string): Promise<k8s.V1ConfigMap[]> {
        try {
            const response = await this.coreApi.listNamespacedConfigMap(
                namespace,
                undefined,
                undefined,
                undefined,
                undefined,
                labelSelector
            );
            return response.body.items;
        } catch (error) {
            console.error('Failed to get ConfigMaps:', error);
            return [];
        }
    }

    async getConfigMap(namespace: string, name: string): Promise<k8s.V1ConfigMap | null> {
        try {
            const response = await this.coreApi.readNamespacedConfigMap(name, namespace);
            return response.body;
        } catch (error) {
            console.error(`Failed to get ConfigMap ${name}:`, error);
            return null;
        }
    }

    async patchConfigMap(namespace: string, name: string, patch: any): Promise<boolean> {
        try {
            await this.coreApi.patchNamespacedConfigMap(
                name,
                namespace,
                patch,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                { headers: { 'Content-Type': 'application/strategic-merge-patch+json' } }
            );
            return true;
        } catch (error) {
            console.error(`Failed to patch ConfigMap ${name}:`, error);
            return false;
        }
    }

    async getDeployment(namespace: string, name: string): Promise<k8s.V1Deployment | null> {
        try {
            const response = await this.appsApi.readNamespacedDeployment(name, namespace);
            return response.body;
        } catch (error) {
            console.error(`Failed to get Deployment ${name}:`, error);
            return null;
        }
    }

    async getPods(namespace: string, labelSelector?: string): Promise<k8s.V1Pod[]> {
        try {
            const response = await this.coreApi.listNamespacedPod(
                namespace,
                undefined,
                undefined,
                undefined,
                undefined,
                labelSelector
            );
            return response.body.items;
        } catch (error) {
            console.error('Failed to get Pods:', error);
            return [];
        }
    }

    async watchConfigMaps(
        namespace: string, 
        labelSelector: string,
        callback: (type: string, configMap: k8s.V1ConfigMap) => void
    ): Promise<() => void> {
        const watch = new k8s.Watch(this.kc);
        let request: any;

        try {
            request = await watch.watch(
                `/api/v1/namespaces/${namespace}/configmaps`,
                { labelSelector },
                callback,
                (err) => {
                    console.error('Watch error:', err);
                    // Reconnect after error
                    setTimeout(() => {
                        this.watchConfigMaps(namespace, labelSelector, callback);
                    }, 5000);
                }
            );
        } catch (error) {
            console.error('Failed to set up watch:', error);
        }

        // Return cleanup function
        return () => {
            if (request) {
                request.abort();
            }
        };
    }
}