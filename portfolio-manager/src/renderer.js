/**
 * Portfolio Manager - Renderer Process
 * Frontend logic and Chart.js visualizations
 */

const { ipcRenderer } = require('electron');

let portfolioData = null;

// Initialize app
async function init() {
    try {
        portfolioData = await ipcRenderer.invoke('load-portfolio-data');
        console.log('Portfolio data loaded:', portfolioData);

        renderOverview();
        renderProjects();
        renderStorage();
        renderDuplicates();
        renderTechnologies();
        renderTests();

        // Show app, hide loading
        document.getElementById('loading').style.display = 'none';
        document.getElementById('app').style.display = 'flex';

    } catch (error) {
        console.error('Failed to load portfolio data:', error);
        document.getElementById('loading').textContent = 'Error loading portfolio data';
    }
}

// Navigation
document.addEventListener('DOMContentLoaded', () => {
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const viewName = item.dataset.view;

            // Update active nav
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            // Update active view
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            document.getElementById(`view-${viewName}`).classList.add('active');

            // Update header title
            const titles = {
                overview: 'Portfolio Overview',
                projects: 'All Projects',
                storage: 'Storage Analysis',
                duplicates: 'Duplicate Files',
                technologies: 'Technology Stack',
                tests: 'Test Coverage'
            };
            document.getElementById('page-title').textContent = titles[viewName];
        });
    });

    init();
});

// Format bytes to human-readable
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// Format number with commas
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Render Overview
function renderOverview() {
    if (!portfolioData) return;

    const { summary } = portfolioData;

    // Update header stats
    document.getElementById('total-projects').textContent = formatNumber(summary.totalProjects);
    document.getElementById('total-files').textContent = formatNumber(summary.totalFiles);
    document.getElementById('total-size').textContent = formatBytes(summary.totalSize);
    document.getElementById('total-lines').textContent = formatNumber(summary.totalLines);

    // Render overview cards
    const overviewContent = document.getElementById('overview-content');
    overviewContent.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-top: 1rem;">
            <div style="text-align: center; padding: 1rem; background: rgba(139, 92, 246, 0.1); border-radius: 8px;">
                <div style="font-size: 2rem; font-weight: 700; color: var(--accent);">${formatNumber(summary.totalFiles)}</div>
                <div style="font-size: 0.875rem; color: var(--text-secondary);">Total Files</div>
            </div>
            <div style="text-align: center; padding: 1rem; background: rgba(16, 185, 129, 0.1); border-radius: 8px;">
                <div style="font-size: 2rem; font-weight: 700; color: var(--success);">${formatBytes(summary.totalSize)}</div>
                <div style="font-size: 0.875rem; color: var(--text-secondary);">Total Size</div>
            </div>
            <div style="text-align: center; padding: 1rem; background: rgba(251, 191, 36, 0.1); border-radius: 8px;">
                <div style="font-size: 2rem; font-weight: 700; color: var(--warning);">${formatNumber(summary.totalLines)}</div>
                <div style="font-size: 0.875rem; color: var(--text-secondary);">Lines of Code</div>
            </div>
        </div>

        <div style="margin-top: 2rem;">
            <h3 style="margin-bottom: 1rem; font-size: 1rem; font-weight: 600;">Top Projects by Size</h3>
            ${renderTopProjects()}
        </div>

        <div style="margin-top: 2rem;">
            <h3 style="margin-bottom: 1rem; font-size: 1rem; font-weight: 600;">Technology Distribution</h3>
            ${renderTechDistribution()}
        </div>
    `;

    // Render storage chart
    renderStorageChart();
}

// Render top projects
function renderTopProjects() {
    const projects = Object.entries(portfolioData.projects)
        .sort((a, b) => b[1].totalSize - a[1].totalSize)
        .slice(0, 5);

    return projects.map(([name, data]) => `
        <div style="display: flex; justify-content: space-between; padding: 0.75rem; background: var(--bg); border-radius: 6px; margin-bottom: 0.5rem;">
            <div style="font-weight: 500;">${name}</div>
            <div style="color: var(--text-secondary);">${formatBytes(data.totalSize)}</div>
        </div>
    `).join('');
}

// Render technology distribution
function renderTechDistribution() {
    const techCount = {};

    Object.values(portfolioData.projects).forEach(project => {
        if (project.technologies) {
            project.technologies.forEach(tech => {
                techCount[tech] = (techCount[tech] || 0) + 1;
            });
        }
    });

    const topTech = Object.entries(techCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

    return `
        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
            ${topTech.map(([tech, count]) => `
                <div class="tech-tag">
                    ${tech} <span style="opacity: 0.6;">(${count})</span>
                </div>
            `).join('')}
        </div>
    `;
}

// Render storage chart with Chart.js
function renderStorageChart() {
    const canvas = document.getElementById('storage-chart');
    const ctx = canvas.getContext('2d');

    const projects = Object.entries(portfolioData.projects)
        .sort((a, b) => b[1].totalSize - a[1].totalSize);

    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: projects.map(([name]) => name),
            datasets: [{
                data: projects.map(([, data]) => data.totalSize),
                backgroundColor: [
                    '#8b5cf6', '#10b981', '#fbbf24', '#ef4444', '#06b6d4',
                    '#ec4899', '#f97316', '#84cc16', '#a855f7', '#14b8a6',
                    '#f59e0b', '#6366f1'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: '#f5f5f5',
                        font: { size: 11 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const label = context.label || '';
                            const value = formatBytes(context.parsed);
                            return `${label}: ${value}`;
                        }
                    }
                }
            }
        }
    });
}

// Render Projects Grid
function renderProjects() {
    const grid = document.getElementById('projects-grid');

    const projectCards = Object.entries(portfolioData.projects).map(([name, data]) => {
        const hasTests = data.hasTests || false;
        const techCount = data.technologies ? data.technologies.length : 0;

        return `
            <div class="project-card" onclick="openProject('${name}')">
                <div class="project-name">${name}</div>
                <div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 1rem;">
                    ${data.description || 'No description available'}
                </div>

                <div class="project-stats">
                    <div class="stat">Files: <span class="stat-value">${formatNumber(data.totalFiles)}</span></div>
                    <div class="stat">Size: <span class="stat-value">${formatBytes(data.totalSize)}</span></div>
                    <div class="stat">Lines: <span class="stat-value">${formatNumber(data.totalLines)}</span></div>
                    <div class="stat">Tests: <span class="stat-value status-badge ${hasTests ? 'success' : 'warning'}">${hasTests ? 'Yes' : 'No'}</span></div>
                </div>

                ${data.technologies ? `
                    <div class="tech-tags">
                        ${data.technologies.slice(0, 4).map(tech => `<div class="tech-tag">${tech}</div>`).join('')}
                        ${techCount > 4 ? `<div class="tech-tag">+${techCount - 4} more</div>` : ''}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    grid.innerHTML = projectCards;
}

// Render Storage Analysis
function renderStorage() {
    const content = document.getElementById('storage-content');

    const projects = Object.entries(portfolioData.projects)
        .sort((a, b) => b[1].totalSize - a[1].totalSize);

    content.innerHTML = `
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="border-bottom: 1px solid var(--border); text-align: left;">
                    <th style="padding: 0.75rem;">Project</th>
                    <th style="padding: 0.75rem;">Files</th>
                    <th style="padding: 0.75rem;">Size</th>
                    <th style="padding: 0.75rem;">Avg File Size</th>
                </tr>
            </thead>
            <tbody>
                ${projects.map(([name, data]) => `
                    <tr style="border-bottom: 1px solid var(--border);">
                        <td style="padding: 0.75rem; font-weight: 500;">${name}</td>
                        <td style="padding: 0.75rem; color: var(--text-secondary);">${formatNumber(data.totalFiles)}</td>
                        <td style="padding: 0.75rem; color: var(--text-secondary);">${formatBytes(data.totalSize)}</td>
                        <td style="padding: 0.75rem; color: var(--text-secondary);">${formatBytes(data.totalSize / data.totalFiles)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// Render Duplicates
function renderDuplicates() {
    const content = document.getElementById('duplicates-content');

    if (!portfolioData.duplicates || portfolioData.duplicates.length === 0) {
        content.innerHTML = '<p style="color: var(--text-secondary);">No duplicate files detected.</p>';
        return;
    }

    const totalWaste = portfolioData.duplicates.reduce((sum, dup) => sum + (dup.size * (dup.count - 1)), 0);

    content.innerHTML = `
        <div style="background: rgba(251, 191, 36, 0.1); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
            <div style="font-size: 1.5rem; font-weight: 700; color: var(--warning);">${formatBytes(totalWaste)}</div>
            <div style="font-size: 0.875rem; color: var(--text-secondary);">Recoverable storage from ${formatNumber(portfolioData.duplicates.length)} duplicate groups</div>
        </div>

        <div style="max-height: 400px; overflow-y: auto;">
            ${portfolioData.duplicates.slice(0, 20).map(dup => `
                <div style="padding: 0.75rem; background: var(--bg); border-radius: 6px; margin-bottom: 0.5rem;">
                    <div style="display: flex; justify-content: between; margin-bottom: 0.5rem;">
                        <div style="font-weight: 500;">${dup.name || 'Unknown'}</div>
                        <div style="color: var(--warning);">${dup.count} copies • ${formatBytes(dup.size * (dup.count - 1))} waste</div>
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">
                        Hash: ${dup.hash}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// Render Technologies
function renderTechnologies() {
    const content = document.getElementById('tech-content');

    const techProjects = {};

    Object.entries(portfolioData.projects).forEach(([name, data]) => {
        if (data.technologies) {
            data.technologies.forEach(tech => {
                if (!techProjects[tech]) techProjects[tech] = [];
                techProjects[tech].push(name);
            });
        }
    });

    const sorted = Object.entries(techProjects)
        .sort((a, b) => b[1].length - a[1].length);

    content.innerHTML = sorted.map(([tech, projects]) => `
        <div style="padding: 1rem; background: var(--bg); border-radius: 8px; margin-bottom: 1rem;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <div style="font-weight: 600; font-size: 1.125rem;">${tech}</div>
                <div class="status-badge success">${projects.length} project${projects.length > 1 ? 's' : ''}</div>
            </div>
            <div style="font-size: 0.875rem; color: var(--text-secondary);">
                Used in: ${projects.join(', ')}
            </div>
        </div>
    `).join('');
}

// Render Tests
function renderTests() {
    const content = document.getElementById('tests-content');

    const withTests = Object.entries(portfolioData.projects)
        .filter(([, data]) => data.hasTests);

    const withoutTests = Object.entries(portfolioData.projects)
        .filter(([, data]) => !data.hasTests);

    content.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem;">
            <div style="text-align: center; padding: 2rem; background: rgba(16, 185, 129, 0.1); border-radius: 8px;">
                <div style="font-size: 3rem; font-weight: 700; color: var(--success);">${withTests.length}</div>
                <div style="font-size: 0.875rem; color: var(--text-secondary);">Projects with Tests</div>
            </div>
            <div style="text-align: center; padding: 2rem; background: rgba(239, 68, 68, 0.1); border-radius: 8px;">
                <div style="font-size: 3rem; font-weight: 700; color: var(--error);">${withoutTests.length}</div>
                <div style="font-size: 0.875rem; color: var(--text-secondary);">Projects without Tests</div>
            </div>
        </div>

        <h3 style="margin-bottom: 1rem; font-size: 1rem; font-weight: 600;">Projects with Tests</h3>
        <div style="margin-bottom: 2rem;">
            ${withTests.map(([name]) => `
                <div style="padding: 0.75rem; background: var(--bg); border-radius: 6px; margin-bottom: 0.5rem;">
                    <span style="font-weight: 500;">${name}</span>
                    <span class="status-badge success" style="margin-left: 1rem;">✓ Tested</span>
                </div>
            `).join('')}
        </div>

        <h3 style="margin-bottom: 1rem; font-size: 1rem; font-weight: 600;">Projects Needing Tests</h3>
        <div>
            ${withoutTests.map(([name]) => `
                <div style="padding: 0.75rem; background: var(--bg); border-radius: 6px; margin-bottom: 0.5rem;">
                    <span style="font-weight: 500;">${name}</span>
                    <span class="status-badge error" style="margin-left: 1rem;">⚠ No tests</span>
                </div>
            `).join('')}
        </div>
    `;
}

// Open project in file explorer
async function openProject(projectName) {
    await ipcRenderer.invoke('open-project', projectName);
}

// Cleanup duplicates (placeholder)
function cleanupDuplicates() {
    alert('Duplicate cleanup functionality will be implemented in next update.\n\nThis will allow you to review and remove duplicate files to recover ' +
          formatBytes(portfolioData.duplicates.reduce((sum, dup) => sum + (dup.size * (dup.count - 1)), 0)) + ' of storage.');
}
