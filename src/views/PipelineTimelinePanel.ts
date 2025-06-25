import * as vscode from 'vscode';
import { Pipeline, PipelineEvent, EventType } from '../models/Pipeline';

export class PipelineTimelinePanel {
    public static currentPanel: PipelineTimelinePanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static render(extensionUri: vscode.Uri, pipeline: Pipeline) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (PipelineTimelinePanel.currentPanel) {
            PipelineTimelinePanel.currentPanel._panel.reveal(column);
            PipelineTimelinePanel.currentPanel._update(pipeline);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'pipelineTimeline',
            `Pipeline: ${pipeline.appName}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        PipelineTimelinePanel.currentPanel = new PipelineTimelinePanel(panel, extensionUri);
        PipelineTimelinePanel.currentPanel._update(pipeline);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public dispose() {
        PipelineTimelinePanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update(pipeline: Pipeline) {
        this._panel.title = `Pipeline: ${pipeline.appName}`;
        this._panel.webview.html = this._getHtmlForWebview(pipeline);
    }

    private _getHtmlForWebview(pipeline: Pipeline) {
        const styleUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'timeline.css')
        );

        // Generate Mermaid diagram
        const mermaidDiagram = this._generateMermaidDiagram(pipeline);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pipeline Timeline</title>
    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
    <script>
        mermaid.initialize({ 
            startOnLoad: true,
            theme: 'dark',
            themeVariables: {
                darkMode: true,
                background: '#1e1e1e',
                mainBkg: '#2d2d2d',
                secondBkg: '#3d3d3d',
                lineColor: '#5a5a5a',
                primaryTextColor: '#cccccc',
                fontFamily: 'var(--vscode-font-family)'
            }
        });
    </script>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
        }
        .header {
            margin-bottom: 30px;
        }
        .header h1 {
            margin: 0 0 10px 0;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .status {
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 14px;
            font-weight: normal;
        }
        .status.success {
            background-color: var(--vscode-testing-iconPassed);
            color: white;
        }
        .status.failed {
            background-color: var(--vscode-testing-iconFailed);
            color: white;
        }
        .status.running {
            background-color: var(--vscode-progressBar-background);
            color: white;
        }
        .metadata {
            color: var(--vscode-descriptionForeground);
            font-size: 14px;
        }
        .mermaid {
            margin: 40px 0;
            text-align: center;
        }
        .event-details {
            margin-top: 30px;
            border-top: 1px solid var(--vscode-widget-border);
            padding-top: 20px;
        }
        .event-item {
            padding: 10px;
            margin-bottom: 10px;
            background-color: var(--vscode-editor-lineHighlightBackground);
            border-radius: 4px;
            cursor: pointer;
        }
        .event-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .event-time {
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }
        .event-details-panel {
            margin-top: 10px;
            padding: 10px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 4px;
            display: none;
        }
        .event-details-panel.show {
            display: block;
        }
        pre {
            margin: 0;
            white-space: pre-wrap;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>
            ${pipeline.appName}
            <span class="status ${pipeline.status}">${pipeline.status.toUpperCase()}</span>
        </h1>
        <div class="metadata">
            <div>Started: ${new Date(pipeline.startTime * 1000).toLocaleString()}</div>
            ${pipeline.endTime ? `<div>Ended: ${new Date(pipeline.endTime * 1000).toLocaleString()}</div>` : ''}
            ${pipeline.duration ? `<div>Duration: ${Math.round(pipeline.duration)}s</div>` : ''}
            <div>Trigger: ${pipeline.trigger.type}${pipeline.trigger.user ? ` by ${pipeline.trigger.user}` : ''}</div>
        </div>
    </div>

    <div class="mermaid">
        ${mermaidDiagram}
    </div>

    <div class="event-details">
        <h2>Stage Details</h2>
        ${pipeline.stages.sort((a, b) => a.startedAt - b.startedAt).map((stage, index) => `
            <div class="event-item" id="event-${stage.id}" onclick="toggleDetails('${stage.id}')">
                <div style="display: flex; justify-content: space-between;">
                    <strong>${stage.stageName}</strong>
                    <span class="event-time">${new Date(stage.startedAt * 1000).toLocaleTimeString()}</span>
                </div>
                <div>Component: ${stage.component} | Status: ${stage.status} | Duration: ${stage.duration !== null && stage.duration !== undefined ? Math.round(stage.duration) + 's' : 'Running'}</div>
                ${stage.errorMessage ? `<div style="color: var(--vscode-errorForeground);">Error: ${stage.errorMessage}</div>` : ''}
                <div class="event-details-panel" id="details-${stage.id}">
                    <pre>${JSON.stringify(stage.details || {}, null, 2)}</pre>
                </div>
            </div>
        `).join('')}
    </div>

    <script>
        function toggleDetails(eventId) {
            const panel = document.getElementById('details-' + eventId);
            panel.classList.toggle('show');
        }

        function scrollToEvent(eventId) {
            const element = document.getElementById('event-' + eventId);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                element.style.backgroundColor = 'var(--vscode-list-activeSelectionBackground)';
                setTimeout(() => {
                    element.style.backgroundColor = '';
                }, 2000);
            }
        }
    </script>
</body>
</html>`;
    }

    private _generateMermaidDiagram(pipeline: Pipeline) {
        if (pipeline.stages.length === 0) {
            return 'graph LR\n    A[No stages]';
        }

        // Sort stages by start time
        const sortedStages = [...pipeline.stages].sort((a, b) => a.startedAt - b.startedAt);
        
        // Group stages by their start time to identify parallel stages
        const stageGroups: Map<number, typeof sortedStages> = new Map();
        sortedStages.forEach(stage => {
            const startTime = stage.startedAt;
            if (!stageGroups.has(startTime)) {
                stageGroups.set(startTime, []);
            }
            stageGroups.get(startTime)!.push(stage);
        });

        // Build the graph
        let graph = 'graph LR\n';
        let prevGroupIds: string[] = [];
        
        Array.from(stageGroups.entries()).forEach(([startTime, stages], groupIndex) => {
            const currentGroupIds: string[] = [];
            
            stages.forEach((stage, stageIndex) => {
                const stageId = stage.id.substring(0, 8); // Use first 8 chars of UUID
                const duration = stage.duration !== null && stage.duration !== undefined 
                    ? `${Math.round(stage.duration)}s` 
                    : 'Running';
                const statusIcon = stage.status === 'succeeded' ? '✓' : 
                                 stage.status === 'failed' ? '✗' : 
                                 stage.status === 'running' ? '⟳' : '○';
                
                graph += `    ${stageId}["${statusIcon} ${stage.stageName}<br/>${duration}"]\n`;
                
                // Style based on status
                if (stage.status === 'succeeded') {
                    graph += `    style ${stageId} fill:#4caf50,stroke:#2e7d32,color:#fff\n`;
                } else if (stage.status === 'failed') {
                    graph += `    style ${stageId} fill:#f44336,stroke:#c62828,color:#fff\n`;
                } else if (stage.status === 'running') {
                    graph += `    style ${stageId} fill:#2196f3,stroke:#1565c0,color:#fff\n`;
                } else {
                    graph += `    style ${stageId} fill:#9e9e9e,stroke:#616161,color:#fff\n`;
                }
                
                currentGroupIds.push(stageId);
                
                // Connect from previous stages
                if (prevGroupIds.length > 0) {
                    prevGroupIds.forEach(prevId => {
                        graph += `    ${prevId} --> ${stageId}\n`;
                    });
                }
            });
            
            prevGroupIds = currentGroupIds;
        });
        
        return graph;
    }
}