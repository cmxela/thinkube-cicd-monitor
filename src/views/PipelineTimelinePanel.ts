import * as vscode from 'vscode';
import { Pipeline, StageStatus } from '../models/Pipeline';

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

        // Use Mermaid diagram from backend if available, otherwise generate locally
        const mermaidDiagram = (pipeline as any).mermaidGantt || this._generateMermaidDiagram(pipeline);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pipeline Timeline</title>
    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
    <script>
        const vscodeTheme = document.body.classList.contains('vscode-light') ? 'default' : 'dark';
        mermaid.initialize({ 
            startOnLoad: true,
            theme: vscodeTheme,
            gantt: {
                leftPadding: 250,  // Further increase space for section names
                rightPadding: 150,
                topPadding: 50,
                barHeight: 20,
                barGap: 4,
                fontSize: 12,
                sectionFontSize: 14,
                gridLineStartPadding: 220,  // Move grid lines further to the right
                numberSectionStyles: 2,
                // Override default colors for different task types
                taskBkgColor: '#ff9933',  // Orange for default tasks
                taskBorderColor: '#ff7700'
            },
            themeVariables: {
                darkMode: vscodeTheme === 'dark',
                background: vscodeTheme === 'dark' ? '#1e1e1e' : '#ffffff',
                primaryColor: vscodeTheme === 'dark' ? '#3794ff' : '#0066cc',
                primaryTextColor: vscodeTheme === 'dark' ? '#cccccc' : '#333333',
                primaryBorderColor: vscodeTheme === 'dark' ? '#3794ff' : '#0066cc',
                lineColor: vscodeTheme === 'dark' ? '#5a5a5a' : '#333333',
                secondaryColor: vscodeTheme === 'dark' ? '#4EC9B0' : '#007acc',
                tertiaryColor: vscodeTheme === 'dark' ? '#374151' : '#f3f4f6',
                mainBkg: vscodeTheme === 'dark' ? '#1e1e1e' : '#ffffff',
                secondBkg: vscodeTheme === 'dark' ? '#2d2d2d' : '#f3f4f6',
                tertiaryBkg: vscodeTheme === 'dark' ? '#374151' : '#e5e7eb',
                taskTextLightColor: vscodeTheme === 'dark' ? '#ffffff' : '#000000',
                taskTextDarkColor: vscodeTheme === 'dark' ? '#ffffff' : '#000000',
                taskTextColor: vscodeTheme === 'dark' ? '#cccccc' : '#333333',
                sectionBkgColor: vscodeTheme === 'dark' ? '#3794ff' : '#e5e7eb',
                sectionBkgColor2: vscodeTheme === 'dark' ? '#4EC9B0' : '#ddd',
                altSectionBkgColor: vscodeTheme === 'dark' ? '#555' : '#f9f9f9',
                gridColor: vscodeTheme === 'dark' ? '#444' : '#ddd',
                // Task colors based on type
                activeTaskBkgColor: '#5DADE2',  // Light blue for workflow tasks (active status)
                activeTaskBorderColor: '#3498DB',
                doneTaskBkgColor: '#82E0AA',  // Light green for deployment tasks (done status)
                doneTaskBorderColor: '#58D68D',
                taskBkgColor: '#F8C471',  // Light orange for other tasks (no status)
                taskBorderColor: '#F39C12',
                critBkgColor: vscodeTheme === 'dark' ? '#ff6b6b' : '#dc3545',
                critBorderColor: vscodeTheme === 'dark' ? '#ff6b6b' : '#dc3545',
                todayLineColor: vscodeTheme === 'dark' ? '#ff6b6b' : '#dc3545',
                fontFamily: 'var(--vscode-font-family)',
                fontSize: '14px'
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
            overflow-x: auto;
        }
        /* Adjust Gantt chart section spacing */
        .mermaid .section {
            text-anchor: start !important;
            padding-right: 20px !important;
        }
        .mermaid .section0, .mermaid .section1, .mermaid .section2 {
            fill: transparent !important;
        }
        .mermaid text.sectionTitle {
            text-anchor: start !important;
            font-weight: bold !important;
        }
        /* Custom task colors based on task ID patterns */
        /* Workflow tasks (light blue) */
        .mermaid rect[id*="workflow"] {
            fill: #5DADE2 !important;
            stroke: #3498DB !important;
        }
        /* Deployment tasks (light green) */
        .mermaid rect[id*="deployment"] {
            fill: #82E0AA !important;
            stroke: #58D68D !important;
        }
        /* Other tasks (light orange) */
        .mermaid rect[id*="other"] {
            fill: #F8C471 !important;
            stroke: #F39C12 !important;
        }
        /* Failed tasks (keep red) */
        .mermaid rect.crit {
            fill: #ff6b6b !important;
            stroke: #ff4444 !important;
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
                <div>Component: ${stage.component} | Status: ${stage.status} | Duration: ${stage.duration !== null && stage.duration !== undefined && stage.duration >= 0 ? Math.round(stage.duration) + 's' : 'Running'}</div>
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
            return 'gantt\n    title No stages\n    dateFormat X\n    axisFormat %s';
        }

        // Sort stages by start time
        const sortedStages = [...pipeline.stages].sort((a, b) => a.startedAt - b.startedAt);
        
        // Build the Gantt chart using proper Mermaid syntax
        let gantt = 'gantt\n';
        // Escape title to avoid syntax errors
        const safeTitle = pipeline.appName.replace(/[:\[\]{}",]/g, '').trim();
        gantt += `    title ${safeTitle} Pipeline Execution\n`;
        gantt += '    dateFormat X\n';  // Unix timestamp format
        gantt += '    axisFormat %H:%M:%S\n';
        
        // Add each stage without sections (sections seem to cause issues)
        sortedStages.forEach((stage, index) => {
            const startTime = stage.startedAt;
            const endTime = stage.completedAt || Math.floor(Date.now() / 1000);
            
            // Determine status for styling
            let status = '';
            if (stage.status === StageStatus.SUCCEEDED) {
                status = 'done, ';
            } else if (stage.status === StageStatus.FAILED) {
                status = 'crit, ';
            } else if (stage.status === StageStatus.RUNNING) {
                status = 'active, ';
            }
            
            // Create a safe task name and ID
            // Escape special characters that can break Mermaid syntax
            const taskName = `${stage.stageName} (${stage.component})`
                .replace(/:/g, '-')
                .replace(/,/g, '')
                .replace(/[\[\]{}]/g, '')
                .replace(/"/g, "'")
                .replace(/\n/g, ' ')
                .trim();
            const taskId = `task${index}`;
            
            // Format based on Mermaid documentation: taskName :status, taskId, startDate, endDate
            gantt += `    ${taskName} :${status}${taskId}, ${startTime}, ${endTime}\n`;
        });
        
        return gantt;
    }
}