import * as vscode from 'vscode';
import { PipelineTreeProvider } from './views/PipelineTreeProvider';
import { EventsTreeProvider } from './views/EventsTreeProvider';
import { PipelineTimelinePanel } from './views/PipelineTimelinePanel';
import { K8sClient } from './api/K8sClient';
import { PipelineMonitor } from './api/PipelineMonitor';
import { EventStream } from './api/EventStream';

let pipelineMonitor: PipelineMonitor;
let eventStream: EventStream | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Thinkube CI/CD Monitor is now active!');

    // First, register the configure command - this should always work
    context.subscriptions.push(
        vscode.commands.registerCommand('thinkube-cicd.configure', async () => {
            await configureExtension();
        })
    );

    let k8sClient: K8sClient | undefined;
    let pipelineProvider: PipelineTreeProvider | undefined;
    let eventsProvider: EventsTreeProvider | undefined;

    try {
        // Initialize Kubernetes client
        k8sClient = new K8sClient();
        
        // Initialize pipeline monitor
        pipelineMonitor = new PipelineMonitor(k8sClient);

        // Create tree data providers
        pipelineProvider = new PipelineTreeProvider(pipelineMonitor);
        eventsProvider = new EventsTreeProvider(pipelineMonitor);

        // Register tree data providers
        vscode.window.registerTreeDataProvider('thinkube-cicd.pipelines', pipelineProvider);
        vscode.window.registerTreeDataProvider('thinkube-cicd.events', eventsProvider);
    } catch (error) {
        console.error('Failed to initialize CI/CD Monitor:', error);
        vscode.window.showWarningMessage('CI/CD Monitor: Failed to initialize. Click "Configure Connection" to set up.');
    }

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('thinkube-cicd.refreshPipelines', () => {
            if (pipelineProvider && eventsProvider) {
                pipelineProvider.refresh();
                eventsProvider.refresh();
            } else {
                vscode.window.showWarningMessage('CI/CD Monitor not fully initialized. Please configure the extension.');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('thinkube-cicd.showPipeline', async (pipelineId: string) => {
            const pipeline = await pipelineMonitor.getPipeline(pipelineId);
            if (pipeline) {
                PipelineTimelinePanel.render(context.extensionUri, pipeline);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('thinkube-cicd.showTimeline', async (pipelineId: string) => {
            const pipeline = await pipelineMonitor.getPipeline(pipelineId);
            if (pipeline) {
                PipelineTimelinePanel.render(context.extensionUri, pipeline);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('thinkube-cicd.triggerBuild', async () => {
            const apps = await pipelineMonitor.getApplications();
            const selected = await vscode.window.showQuickPick(apps, {
                placeHolder: 'Select application to build'
            });
            
            if (selected) {
                // TODO: Implement build trigger
                vscode.window.showInformationMessage(`Triggering build for ${selected}...`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('thinkube-cicd.showMetrics', async () => {
            const apps = await pipelineMonitor.getApplications();
            const selected = await vscode.window.showQuickPick(apps, {
                placeHolder: 'Select application for metrics'
            });
            
            if (selected) {
                const metrics = await pipelineMonitor.getMetrics(selected);
                // TODO: Show metrics in webview
                vscode.window.showInformationMessage(`Metrics for ${selected}: ${JSON.stringify(metrics)}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('thinkube-cicd.analyzePipeline', async (pipelineId: string) => {
            const analysis = await pipelineMonitor.analyzePipeline(pipelineId);
            if (analysis) {
                // TODO: Show analysis in webview
                vscode.window.showInformationMessage(`Analysis: ${analysis.summary}`);
            }
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

    // Show welcome message
    const showNotifications = vscode.workspace.getConfiguration('thinkube-cicd').get('showNotifications', true);
    if (showNotifications) {
        vscode.window.showInformationMessage('Thinkube CI/CD Monitor activated. Connecting to pipeline monitor...');
    }
}

async function setupWebSocket(
    context: vscode.ExtensionContext, 
    pipelineProvider: PipelineTreeProvider,
    eventsProvider: EventsTreeProvider
) {
    const apiUrl = vscode.workspace.getConfiguration('thinkube-cicd').get('apiUrl', '');
    if (!apiUrl) {
        return;
    }

    try {
        eventStream = new EventStream(apiUrl);
        
        eventStream.on('pipeline-event', (event) => {
            // Update providers
            pipelineProvider.refresh();
            eventsProvider.addEvent(event);
            
            // Show notifications based on settings
            const notificationLevel = vscode.workspace.getConfiguration('thinkube-cicd').get('notificationLevel', 'failures');
            const showNotifications = vscode.workspace.getConfiguration('thinkube-cicd').get('showNotifications', true);
            
            if (showNotifications && shouldNotify(event, notificationLevel)) {
                showEventNotification(event);
            }
        });

        await eventStream.connect();
        
        context.subscriptions.push({
            dispose: () => eventStream?.disconnect()
        });
    } catch (error) {
        console.error('Failed to set up WebSocket connection:', error);
    }
}

function shouldNotify(event: any, level: string): boolean {
    if (level === 'none') return false;
    if (level === 'all') return true;
    if (level === 'failures') {
        return event.status === 'failed' || event.eventType.includes('FAILED');
    }
    return false;
}

function showEventNotification(event: any) {
    const actions = ['View Pipeline', 'View Logs'];
    
    vscode.window.showInformationMessage(
        `${event.appName}: ${event.eventType} - ${event.status}`,
        ...actions
    ).then(selection => {
        if (selection === 'View Pipeline') {
            vscode.commands.executeCommand('thinkube-cicd.showPipeline', event.pipelineId);
        } else if (selection === 'View Logs') {
            // TODO: Implement log viewing
        }
    });
}

async function configureExtension() {
    const config = vscode.workspace.getConfiguration('thinkube-cicd');
    
    const apiUrl = await vscode.window.showInputBox({
        prompt: 'CI/CD Monitor API URL',
        value: config.get('apiUrl', 'https://cicd-monitor.thinkube.com'),
        validateInput: (value) => {
            try {
                new URL(value);
                return null;
            } catch {
                return 'Please enter a valid URL';
            }
        }
    });
    
    if (apiUrl) {
        await config.update('apiUrl', apiUrl, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage('Configuration updated. Please reload VS Code to apply changes.');
    }
}

export function deactivate() {
    eventStream?.disconnect();
}