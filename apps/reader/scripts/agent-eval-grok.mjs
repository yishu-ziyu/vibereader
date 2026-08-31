#!/usr/bin/env node
/**
 * Thin wrapper: run live agent eval through vite-node so product ESM loads.
 *
 * Prefer: npm run agent:eval:grok
 * Also:   node scripts/agent-eval-grok.mjs
 *
 * Exit codes are forwarded from scripts/agent-eval-runner.mjs (0/1/2).
 */

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const runner = resolve(here, 'agent-eval-runner.mjs');
const localBin = resolve(root, 'node_modules', '.bin', 'vite-node');

function resolveViteNodeCmd() {
    if (existsSync(localBin)) {
        return { command: localBin, args: [runner], shell: false };
    }
    // Fallback: npx (may hit network if not cached)
    return {
        command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
        args: ['vite-node', runner],
        shell: false,
    };
}

const { command, args } = resolveViteNodeCmd();
console.log(`agent-eval-grok: spawning vite-node for product agent modules`);
console.log(`command: ${command} ${args.map((a) => (a.includes(' ') ? JSON.stringify(a) : a)).join(' ')}`);

const child = spawn(command, args, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
});

child.on('error', (error) => {
    console.error('FAIL: could not spawn vite-node:', error?.message || error);
    console.error('Install devDependency vite-node or run: npx vite-node scripts/agent-eval-runner.mjs');
    process.exit(2);
});

child.on('exit', (code, signal) => {
    if (signal) {
        console.error(`FAIL: vite-node killed by signal ${signal}`);
        process.exit(1);
    }
    process.exit(typeof code === 'number' ? code : 1);
});
