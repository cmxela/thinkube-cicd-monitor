import * as vscode from 'vscode';
import { PipelineTreeProvider } from './views/PipelineTreeProvider';
import { EventsTreeProvider } from './views/EventsTreeProvider';
import { PipelineTimelinePanel } from './views/PipelineTimelinePanel';
import { ControlHubAPI } from './api/ControlHubAPI';

let controlHubAPI: ControlHubAPI;

export function activate(context: vscode.ExtensionContext) {
    console.log('Thinkube CI/CD Monitor is now active!');

    // Initialize the API client
    controlHubAPI = new ControlHubAPI();

    // Create tree data providers using the API
    const pipelineProvider = new PipelineTreeProvider(controlHubAPI);
    const eventsProvider = new EventsTreeProvider(controlHubAPI);

    // Register tree data providers
    vscode.window.registerTreeDataProvider('thinkube-cicd.pipelines', pipelineProvider);
    vscode.window.registerTreeDataProvider('thinkube-cicd.events', eventsProvider);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('thinkube-cicd.refreshPipelines', () => {
            pipelineProvider.refresh();
            eventsProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('thinkube-cicd.showPipeline', async (pipelineId: string) => {
            const pipeline = await controlHubAPI.getPipeline(pipelineId);
            if (pipeline) {
                PipelineTimelinePanel.render(context.extensionUri, pipeline);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('thinkube-cicd.showTimeline', async (pipelineId: string) => {
            const pipeline = await controlHubAPI.getPipeline(pipelineId);
            if (pipeline) {
                PipelineTimelinePanel.render(context.extensionUri, pipeline);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('thinkube-cicd.triggerBuild', async () => {
            const apps = await controlHubAPI.listApplications();
            const selected = await vscode.window.showQuickPick(apps, {
                placeHolder: 'Select application to build'
            });
            
            if (selected) {
                // TODO: Implement build trigger via API
                vscode.window.showInformationMessage(`Triggering build for ${selected}...`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('thinkube-cicd.showMetrics', async () => {
            const apps = await controlHubAPI.listApplications();
            const selected = await vscode.window.showQuickPick(apps, {
                placeHolder: 'Select application for metrics'
            });
            
            if (selected) {
                const metrics = await controlHubAPI.getMetrics(selected);
                // TODO: Show metrics in webview
                vscode.window.showInformationMessage(`Metrics for ${selected}: Success rate ${metrics.successRate.toFixed(1)}%`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('thinkube-cicd.analyzePipeline', async (pipelineId: string) => {
            // TODO: Implement pipeline analysis via API
            vscode.window.showInformationMessage('Pipeline analysis coming soon!');
        })
    );

    // Set up auto-refresh
    const refreshInterval = vscode.workspace.getConfiguration('thinkube-cicd').get('refreshInterval', 5000);
    const refreshTimer = setInterval(() => {
        if (pipelineProvider.isVisible()) {
            pipelineProvider.refresh();
            eventsProvider.refresh();
        }
    }, refreshInterval);

    context.subscriptions.push({
        dispose: () => clearInterval(refreshTimer)
    });

    // Set up WebSocket connection for real-time updates
    setupWebSocket(context, pipelineProvider, eventsProvider);

    // Check API connection
    controlHubAPI.testConnection().then(connected => {
        if (connected) {
            vscode.window.showInformationMessage('CI/CD Monitor connected to Thinkube Control Hub');
        } else {
            vscode.window.showWarningMessage('CI/CD Monitor: Unable to connect to API. Check your network connection.');
        }
    });
}

async function setupWebSocket(
    context: vscode.ExtensionContext, 
    pipelineProvider: PipelineTreeProvider,
    eventsProvider: EventsTreeProvider
) {
    // TODO: Implement WebSocket connection through the API
    // For now, we'll rely on polling via the refresh interval
}

export function deactivate() {
    // Cleanup if needed
}

// 🤖 Generated with Claude